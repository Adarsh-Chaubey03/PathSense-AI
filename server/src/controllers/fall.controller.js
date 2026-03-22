import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ML_SCRIPT_PATH = path.resolve(
  __dirname,
  "../../ml/run_fall_detection.py",
);

function resolvePythonBin() {
  if (process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim().length > 0) {
    return process.env.PYTHON_BIN.trim();
  }

  const repoRoot = path.resolve(__dirname, "../../..");
  const serverRoot = path.resolve(__dirname, "../..");

  const windowsCandidates = [
    path.join(serverRoot, ".venv", "Scripts", "python.exe"),
    path.join(serverRoot, "venv", "Scripts", "python.exe"),
    path.join(repoRoot, ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "venv", "Scripts", "python.exe"),
    path.join(
      repoRoot,
      "fault_detection_model",
      ".venv",
      "Scripts",
      "python.exe",
    ),
    path.join(
      repoRoot,
      "fault_detection_model",
      "venv",
      "Scripts",
      "python.exe",
    ),
  ];

  const unixCandidates = [
    path.join(serverRoot, ".venv", "bin", "python"),
    path.join(serverRoot, "venv", "bin", "python"),
    path.join(repoRoot, ".venv", "bin", "python"),
    path.join(repoRoot, "venv", "bin", "python"),
    path.join(repoRoot, "fault_detection_model", ".venv", "bin", "python"),
    path.join(repoRoot, "fault_detection_model", "venv", "bin", "python"),
  ];

  const candidates =
    process.platform === "win32" ? windowsCandidates : unixCandidates;

  const matched = candidates.find((candidate) => existsSync(candidate));
  return matched ?? "python";
}

const PYTHON_BIN = resolvePythonBin();
const INFERENCE_TIMEOUT_MS = Number(
  process.env.FALL_DETECT_TIMEOUT_MS || 15000,
);
const FALL_GATE_MIN = Number(process.env.FALL_GATE_MIN || 0.15);
const REAL_FALL_MIN = Number(process.env.REAL_FALL_MIN || 0.55);
const FALSE_GATE_MIN = Number(process.env.FALSE_GATE_MIN || 0.76);

console.log(`[FallDetect] Python runtime: ${PYTHON_BIN}`);
console.log(
  `[FallDetect] Thresholds: FALL_GATE_MIN=${FALL_GATE_MIN}, REAL_FALL_MIN=${REAL_FALL_MIN}, FALSE_GATE_MIN=${FALSE_GATE_MIN}`,
);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFiniteNumber(value) {
  return isFiniteNumber(value) && value > 0;
}

function isValidWindow(window) {
  if (!Array.isArray(window) || window.length !== 100) {
    return false;
  }

  return window.every(
    (row) =>
      Array.isArray(row) &&
      row.length === 6 &&
      row.every((value) => isFiniteNumber(value)),
  );
}

function validateOptionalMetadata(body) {
  const { sampleCount, sampleRateHz, windowStartMs, windowEndMs, segment } =
    body ?? {};

  if (
    sampleCount !== undefined &&
    (!Number.isInteger(sampleCount) || sampleCount <= 0)
  ) {
    return {
      valid: false,
      error: "Invalid request: sampleCount must be a positive integer",
    };
  }

  if (sampleRateHz !== undefined && !isPositiveFiniteNumber(sampleRateHz)) {
    return {
      valid: false,
      error: "Invalid request: sampleRateHz must be a positive number",
    };
  }

  if (windowStartMs !== undefined && !isFiniteNumber(windowStartMs)) {
    return {
      valid: false,
      error: "Invalid request: windowStartMs must be numeric",
    };
  }

  if (windowEndMs !== undefined && !isFiniteNumber(windowEndMs)) {
    return {
      valid: false,
      error: "Invalid request: windowEndMs must be numeric",
    };
  }

  if (
    windowStartMs !== undefined &&
    windowEndMs !== undefined &&
    windowEndMs < windowStartMs
  ) {
    return {
      valid: false,
      error: "Invalid request: windowEndMs must be >= windowStartMs",
    };
  }

  if (segment !== undefined) {
    const keys = ["rearPre", "core", "post", "total"];
    const hasInvalidSegment =
      typeof segment !== "object" ||
      segment === null ||
      keys.some((key) => !Number.isInteger(segment[key]) || segment[key] <= 0);

    if (hasInvalidSegment) {
      return {
        valid: false,
        error:
          "Invalid request: segment must include positive integer rearPre/core/post/total",
      };
    }

    if (segment.rearPre + segment.core + segment.post !== segment.total) {
      return {
        valid: false,
        error:
          "Invalid request: segment total must equal rearPre + core + post",
      };
    }
  }

  return {
    valid: true,
    metadata: {
      sampleCount,
      sampleRateHz,
      windowStartMs,
      windowEndMs,
      segment,
    },
  };
}

class PythonFallBridge {
  constructor() {
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = "";
    this.lastError = "";
  }

  ensureStarted() {
    if (this.child && !this.child.killed) {
      return;
    }

    const child = spawn(PYTHON_BIN, [ML_SCRIPT_PATH, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      this._handleStdout(chunk);
    });

    child.stderr.on("data", (chunk) => {
      this.lastError = `${this.lastError}${chunk}`.slice(-2000);
    });

    child.on("close", (code) => {
      const error = new Error(
        `Python ML worker exited with code ${code}. ${this.lastError}`.trim(),
      );

      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(error);
      }

      this.pending.clear();
      this.child = null;
      this.stdoutBuffer = "";
    });

    child.on("error", (error) => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      this.pending.clear();
      this.child = null;
      this.stdoutBuffer = "";
    });

    this.child = child;
    this.lastError = "";
  }

  _handleStdout(chunk) {
    this.stdoutBuffer += chunk;

    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        this._handleLine(line);
      }

      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  _handleLine(line) {
    let parsed;

    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    const id = parsed?.id;
    if (typeof id !== "number") {
      return;
    }

    const pendingRequest = this.pending.get(id);
    if (!pendingRequest) {
      return;
    }

    clearTimeout(pendingRequest.timer);
    this.pending.delete(id);

    if (typeof parsed.error === "string") {
      pendingRequest.reject(new Error(parsed.error));
      return;
    }

    pendingRequest.resolve({
      fall_prob: Number(parsed.fall_prob),
      false_prob: Number(parsed.false_prob),
      decision_reason: parsed.decision_reason,
      result: parsed.result,
    });
  }

  infer(window) {
    this.ensureStarted();

    if (!this.child || this.child.killed || !this.child.stdin.writable) {
      return Promise.reject(new Error("Python ML worker is unavailable"));
    }

    const requestId = this.nextId++;
    const payload = JSON.stringify({ id: requestId, window });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Inference timeout after ${INFERENCE_TIMEOUT_MS}ms`));
      }, INFERENCE_TIMEOUT_MS);

      this.pending.set(requestId, { resolve, reject, timer });

      this.child.stdin.write(`${payload}\n`, (error) => {
        if (!error) {
          return;
        }

        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }
}

const pythonFallBridge = new PythonFallBridge();

export async function detectFall(req, res) {
  const { window } = req.body ?? {};

  const metadataValidation = validateOptionalMetadata(req.body);
  if (!metadataValidation.valid) {
    res.status(400).json({ error: metadataValidation.error });
    return;
  }

  console.log(
    "[FallDetect] Received request with window shape:",
    Array.isArray(window)
      ? `${window.length}x${window[0]?.length || 0}`
      : "invalid",
  );

  if (!isValidWindow(window)) {
    console.log("[FallDetect] Invalid window - must be 100x6 numeric matrix");
    res.status(400).json({
      error: "Invalid request: window must be a 100x6 numeric matrix",
    });
    return;
  }

  if (metadataValidation.metadata) {
    const { sampleCount, sampleRateHz, windowStartMs, windowEndMs, segment } =
      metadataValidation.metadata;
    console.log("[FallDetect] Optional metadata:", {
      sampleCount,
      sampleRateHz,
      windowStartMs,
      windowEndMs,
      segment,
    });
  }

  console.log("[FallDetect] Window validated. First sample:", window[0]);
  console.log("[FallDetect] Last sample:", window[window.length - 1]);

  try {
    console.log("[FallDetect] Sending to Python ML worker...");
    const prediction = await pythonFallBridge.infer(window);

    console.log(
      "[FallDetect] ML Response:",
      JSON.stringify(prediction, null, 2),
    );

    if (
      !isFiniteNumber(prediction.fall_prob) ||
      !isFiniteNumber(prediction.false_prob) ||
      (prediction.result !== "REAL_FALL" &&
        prediction.result !== "FALSE_ALARM" &&
        prediction.result !== "NO_FALL")
    ) {
      throw new Error("Invalid inference response from ML worker");
    }

    const decisionReason =
      typeof prediction.decision_reason === "string"
        ? prediction.decision_reason
        : "UNSPECIFIED";

    console.log(
      "[FallDetect] SUCCESS - Result:",
      prediction.result,
      "| Reason:",
      decisionReason,
      "| Fall prob:",
      (prediction.fall_prob * 100).toFixed(1) + "%",
      "| False prob:",
      (prediction.false_prob * 100).toFixed(1) + "%",
      "| Gates:",
      `fall>=${FALL_GATE_MIN}, real>=${REAL_FALL_MIN}, false>=${FALSE_GATE_MIN}`,
    );

    res.status(200).json(prediction);
  } catch (error) {
    console.error(
      "[FallDetect] ERROR:",
      error instanceof Error ? error.message : error,
    );
    res.status(500).json({
      error: "Python inference failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export default { detectFall };
