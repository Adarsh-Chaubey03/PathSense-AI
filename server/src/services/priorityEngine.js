const RESULT_TYPES = new Set(["REAL_FALL", "FALSE_ALARM", "NO_FALL"]);
const USER_RESPONSES = new Set(["YES", "NO", "NO_RESPONSE"]);

const RESPONSE_SCORES = {
  YES: 0,
  NO: 1,
  NO_RESPONSE: 0.8,
};

const DEFAULT_EMERGENCY_API_URL = process.env.EMERGENCY_API_URL || "";
const DEFAULT_EMERGENCY_API_TIMEOUT_MS = Number(
  process.env.EMERGENCY_API_TIMEOUT_MS || 5000,
);
const DEFAULT_EMERGENCY_API_RETRIES = Number(
  process.env.EMERGENCY_API_RETRIES || 2,
);
const DEFAULT_PERMISSION_REQUIRED =
  String(process.env.REQUIRE_SOS_PERMISSION || "true").toLowerCase() !== "false";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function assertFiniteNumber(value, fieldName) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`[PriorityEngine] ${fieldName} must be a finite number`);
  }
}

function normalizeInput(payload) {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("[PriorityEngine] Input must be an object");
  }

  const {
    fall_prob,
    false_prob,
    result,
    user_response,
    response_time,
  } = payload;

  assertFiniteNumber(fall_prob, "fall_prob");
  assertFiniteNumber(false_prob, "false_prob");
  assertFiniteNumber(response_time, "response_time");

  if (!RESULT_TYPES.has(result)) {
    throw new Error(
      `[PriorityEngine] result must be one of: ${Array.from(RESULT_TYPES).join(", ")}`,
    );
  }

  if (!USER_RESPONSES.has(user_response)) {
    throw new Error(
      `[PriorityEngine] user_response must be one of: ${Array.from(
        USER_RESPONSES,
      ).join(", ")}`,
    );
  }

  return {
    fall_prob: clamp(fall_prob, 0, 1),
    false_prob: clamp(false_prob, 0, 1),
    result,
    user_response,
    response_time: Math.max(response_time, 0),
  };
}

function getActionPlan(input) {
  const { result, user_response, response_time, fall_prob, false_prob } = input;

  // Hard override #1: extremely confident true fall.
  if (fall_prob > 0.9 && false_prob < 0.2) {
    return {
      level: "HIGH",
      action:
        "Call ambulance; notify parents; notify social workers; send emergency SMS with location",
      reason: "high-confidence-model-override",
    };
  }

  // Hard override #2: delayed/no response escalation.
  if (response_time > 10) {
    return {
      level: "HIGH",
      action:
        "Call ambulance; notify parents; notify social workers; send emergency SMS with location",
      reason: "response-time-override",
    };
  }

  if (result === "REAL_FALL") {
    if (user_response === "NO_RESPONSE") {
      return {
        level: "HIGH",
        action:
          "Call ambulance; notify parents; notify social workers; send emergency SMS with location",
        reason: "real-fall-no-response",
      };
    }

    if (user_response === "NO") {
      return {
        level: "MEDIUM",
        action: "Notify parents immediately; send SMS alert; do not call ambulance yet",
        reason: "real-fall-user-needs-help",
      };
    }

    return {
      level: "LOW",
      action: "Ignore emergency; log event only",
      reason: "real-fall-user-confirmed-safe",
    };
  }

  return {
    level: "NONE",
    action: "Do nothing",
    reason: "no-event",
  };
}

export function triggerAmbulance(meta = {}) {
  console.log("[PriorityEngine] Ambulance dispatch triggered", meta);
}

export function notifyParents(meta = {}) {
  console.log("[PriorityEngine] Parents notified", meta);
}

export function notifySocialWorkers(meta = {}) {
  console.log("[PriorityEngine] Social workers notified", meta);
}

function resolvePermission(options = {}) {
  if (typeof options.userPermissionGranted === "boolean") {
    return options.userPermissionGranted;
  }

  if (typeof options.permissionStatus === "string") {
    return options.permissionStatus.toUpperCase() === "GRANTED";
  }

  return false;
}

function resolveSmsRecipients(options = {}) {
  if (Array.isArray(options.smsRecipients)) {
    return options.smsRecipients.filter(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
  }

  const fromEnv = process.env.EMERGENCY_SMS_RECIPIENTS || "";
  return fromEnv
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export async function sendSMS(message, meta = {}, options = {}) {
  const recipients = resolveSmsRecipients(options);

  if (recipients.length === 0) {
    console.warn(
      "[PriorityEngine] No SMS recipients found. Set EMERGENCY_SMS_RECIPIENTS or pass context.smsRecipients.",
    );
    return { success: false, sent: 0, failed: 0, reason: "missing-sms-recipients" };
  }

  try {
    const smsModule = await import("./smsService.ts");
    const sendViaTwilio = smsModule.sendSMS;

    const results = [];
    for (const recipient of recipients) {
      const smsResult = await sendViaTwilio(recipient, message);
      results.push(smsResult);
    }

    const sent = results.filter((result) => result.success).length;
    const failed = results.length - sent;

    console.log("[PriorityEngine] SMS dispatch summary", {
      ...meta,
      recipients: recipients.length,
      sent,
      failed,
    });

    return { success: sent > 0, sent, failed };
  } catch (error) {
    console.error("[PriorityEngine] Twilio SMS send failed", {
      error: error instanceof Error ? error.message : String(error),
      ...meta,
    });

    return { success: false, sent: 0, failed: recipients.length, reason: "twilio-error" };
  }
}

async function callEmergencyApi(payload, options = {}) {
  const emergencyApiUrl = options.emergencyApiUrl ?? DEFAULT_EMERGENCY_API_URL;

  if (!emergencyApiUrl) {
    console.warn(
      "[PriorityEngine] EMERGENCY_API_URL is not configured. Skipping external emergency API call.",
    );
    return { success: false, skipped: true, reason: "missing-emergency-api-url" };
  }

  const retries = Math.max(1, Number(options.retries ?? DEFAULT_EMERGENCY_API_RETRIES));
  const timeoutMs = Math.max(
    1000,
    Number(options.timeoutMs ?? DEFAULT_EMERGENCY_API_TIMEOUT_MS),
  );

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(emergencyApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.authToken
            ? { Authorization: `Bearer ${options.authToken}` }
            : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Emergency API error (${response.status}): ${text || response.statusText}`,
        );
      }

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = { ok: true };
      }

      console.log("[PriorityEngine] Emergency API notified successfully", {
        emergencyApiUrl,
        attempt,
      });

      return { success: true, data };
    } catch (error) {
      clearTimeout(timer);
      lastError = error instanceof Error ? error.message : String(error);
      console.error(
        `[PriorityEngine] Emergency API notify failed (attempt ${attempt}/${retries}):`,
        lastError,
      );
    }
  }

  return { success: false, error: lastError || "Emergency API request failed" };
}

export async function triggerEmergencyAction(decision, options = {}) {
  const { level } = decision;
  const location = options.location ?? "Unknown location";
  const permissionRequired =
    options.requirePermission === undefined
      ? DEFAULT_PERMISSION_REQUIRED
      : Boolean(options.requirePermission);
  const permissionGranted = resolvePermission(options);
  const meta = {
    level,
    location,
    permissionRequired,
    permissionGranted,
    timestamp: new Date().toISOString(),
  };

  if ((level === "HIGH" || level === "MEDIUM") && permissionRequired && !permissionGranted) {
    console.warn(
      "[PriorityEngine] SOS blocked: user permission is required before mobile trigger.",
      meta,
    );
    return;
  }

  if (level === "HIGH") {
    triggerAmbulance(meta);
    notifyParents(meta);
    notifySocialWorkers(meta);
    await sendSMS(
      `EMERGENCY: Fall detected. Location: ${location}`,
      meta,
      options,
    );

    await callEmergencyApi(
      {
        eventType: "FALL_EMERGENCY",
        priority: "HIGH",
        level,
        action: decision.action,
        location,
        timestamp: meta.timestamp,
      },
      options,
    );
    return;
  }

  if (level === "MEDIUM") {
    notifyParents(meta);
    await sendSMS(
      `ALERT: Assistance requested. Location: ${location}`,
      meta,
      options,
    );

    await callEmergencyApi(
      {
        eventType: "FALL_ALERT",
        priority: "MEDIUM",
        level,
        action: decision.action,
        location,
        timestamp: meta.timestamp,
      },
      options,
    );
    return;
  }

  if (level === "LOW") {
    console.log("[PriorityEngine] Low priority event logged", meta);
    return;
  }

  console.log("[PriorityEngine] No emergency action required", meta);
}

export function computePriority(payload, options = {}) {
  const input = normalizeInput(payload);

  const real_fall_score = input.fall_prob * (1 - input.false_prob);
  const time_score = Math.min(input.response_time / 10, 1);
  const response_score = RESPONSE_SCORES[input.user_response];

  const priority_score = Number(
    (
      0.6 * real_fall_score +
      0.25 * time_score +
      0.15 * response_score
    ).toFixed(4),
  );

  const plan = getActionPlan(input);

  const decision = {
    priority_score,
    level: plan.level,
    action: plan.action,
  };

  if (options.triggerActions !== false) {
    void triggerEmergencyAction(decision, {
      location: options.location,
      smsRecipients: options.smsRecipients,
      emergencyApiUrl: options.emergencyApiUrl,
      authToken: options.authToken,
      retries: options.retries,
      timeoutMs: options.timeoutMs,
      userPermissionGranted: options.userPermissionGranted,
      permissionStatus: options.permissionStatus,
      requirePermission: options.requirePermission,
    });
  }

  return decision;
}

// Integration helper for flow: Model -> API -> UI("Are you OK?") -> Priority Engine.
export function processPriorityDecision({ modelOutput, userInteraction, context = {} }) {
  return computePriority(
    {
      ...modelOutput,
      ...userInteraction,
    },
    {
      triggerActions: context.triggerActions,
      location: context.location,
      smsRecipients: context.smsRecipients,
      emergencyApiUrl: context.emergencyApiUrl,
      authToken: context.authToken,
      retries: context.retries,
      timeoutMs: context.timeoutMs,
      userPermissionGranted: context.userPermissionGranted,
      permissionStatus: context.permissionStatus,
      requirePermission: context.requirePermission,
    },
  );
}

export default {
  computePriority,
  processPriorityDecision,
  triggerEmergencyAction,
  triggerAmbulance,
  notifyParents,
  notifySocialWorkers,
  sendSMS,
};
