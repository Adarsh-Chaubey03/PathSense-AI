import type {
  FallDispatchSummary,
  FallStatus,
  FallEventRequest,
  FallEventResponse,
  PriorityDecision,
  ResponseType,
  ValidationResult,
} from '../types/fall.ts';
import { send_alert_by_priority } from './contactManager.ts';
import { appendFallEvent } from './fallEventStore.ts';

const POSITIVE_RESPONSES = ['yes', 'okay', 'ok', 'i am fine', 'fine', 'all good'];
const NEGATIVE_RESPONSES = ['no', 'help', 'not okay', 'hurt', 'pain', 'emergency'];

const RESPONSE_WEIGHTS: Record<ResponseType, number> = {
  POSITIVE: -1.0,
  NEGATIVE: 1.0,
  NONE: 0.6,
};

const DECISION_TTS: Record<PriorityDecision, string> = {
  CANCEL: 'Alert cancelled',
  CONTACTS: 'Alert sent to contacts',
  EMERGENCY: 'Emergency services contacted',
};

/**
 * Validates a fall event based on motion score and orientation change.
 */
export function validateFall(motionScore: number, orientationChange: boolean): ValidationResult {
  if (motionScore < 0.05 && orientationChange) {
    return { status: 'CONFIRMED' };
  }

  if (motionScore > 0.2) {
    return { status: 'REJECTED' };
  }

  return { status: 'UNCERTAIN' };
}

function normalizeTranscript(transcript: string | undefined): string {
  if (!transcript) {
    return '';
  }

  return transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyResponse(normalizedTranscript: string): ResponseType {
  if (normalizedTranscript.length === 0) {
    return 'NONE';
  }

  // Critical ordering: detect "not okay" before generic "okay".
  if (normalizedTranscript.includes('not okay')) {
    return 'NEGATIVE';
  }

  if (NEGATIVE_RESPONSES.some((phrase) => normalizedTranscript.includes(phrase))) {
    return 'NEGATIVE';
  }

  if (POSITIVE_RESPONSES.some((phrase) => normalizedTranscript.includes(phrase))) {
    return 'POSITIVE';
  }

  return 'NONE';
}

function calculateFinalScore(modelScore: number, responseType: ResponseType): {
  responseWeight: number;
  finalScore: number;
} {
  const responseWeight = RESPONSE_WEIGHTS[responseType];
  const finalScore = modelScore * 0.4 + responseWeight * 0.6;

  return { responseWeight, finalScore };
}

function decideAction(responseType: ResponseType, finalScore: number, modelScore: number): PriorityDecision {
  if (responseType === 'POSITIVE') {
    return 'CANCEL';
  }

  // Negative response is always treated as a high-priority emergency signal.
  if (responseType === 'NEGATIVE') {
    return 'EMERGENCY';
  }

  // With no response, a very high model score escalates directly to emergency.
  if (responseType === 'NONE' && modelScore >= 0.85) {
    return 'EMERGENCY';
  }

  if (finalScore >= 0.85) {
    return 'EMERGENCY';
  }

  if (finalScore >= 0.5) {
    return 'CONTACTS';
  }

  return 'CANCEL';
}

function mapDecisionToStatus(decision: PriorityDecision): FallStatus {
  if (decision === 'EMERGENCY') {
    return 'CONFIRMED';
  }

  if (decision === 'CONTACTS') {
    return 'UNCERTAIN';
  }

  return 'REJECTED';
}

function resolveLocationLink(request: FallEventRequest): string {
  if (request.locationLink && request.locationLink.trim().length > 0) {
    return request.locationLink.trim();
  }

  if (request.location && Number.isFinite(request.location.latitude) && Number.isFinite(request.location.longitude)) {
    return `https://maps.google.com/?q=${request.location.latitude},${request.location.longitude}`;
  }

  const fallbackLink = process.env.DEFAULT_LOCATION_LINK?.trim();
  if (fallbackLink && fallbackLink.length > 0) {
    return fallbackLink;
  }

  return 'https://maps.google.com/?q=0,0';
}

async function executeDecisionAction(
  request: FallEventRequest,
  decision: PriorityDecision,
  responseType: ResponseType,
  modelScore: number,
  responseWeight: number,
  finalScore: number,
): Promise<FallDispatchSummary> {
  const ttsMessage = DECISION_TTS[decision];

  if (decision === 'CANCEL') {
    return {
      attempted: false,
      success: false,
      recipientsTotal: 0,
      recipientsSucceeded: 0,
      decision,
      responseType,
      modelScore,
      responseWeight,
      finalScore,
      ttsMessage,
      smsStatus: 'NOT_SENT',
    };
  }

  const locationLink = resolveLocationLink(request);
  const message =
    decision === 'EMERGENCY'
      ? 'EMERGENCY ALERT: Possible fall detected. Immediate assistance required.'
      : 'ALERT: Possible fall detected. Please check immediately.';

  const alertResults = await send_alert_by_priority(message, {
    target: decision,
    locationLink,
  });

  const recipientsTotal = alertResults.length;
  const recipientsSucceeded = alertResults.filter((result) => result.smsResult.success).length;
  const success = recipientsSucceeded > 0;
  const smsStatus =
    recipientsTotal === 0
      ? 'FAILED'
      : recipientsSucceeded === recipientsTotal
        ? 'SENT'
        : recipientsSucceeded > 0
          ? 'PARTIAL'
          : 'FAILED';

  console.log('[FallEvent] SMS sent status:', {
    decision,
    recipientsTotal,
    recipientsSucceeded,
    smsStatus,
  });

  return {
    attempted: recipientsTotal > 0,
    success,
    recipientsTotal,
    recipientsSucceeded,
    decision,
    responseType,
    modelScore,
    responseWeight,
    finalScore,
    ttsMessage,
    smsStatus,
  };
}

/**
 * Handles the complete fall event workflow.
 */
export async function handleFallEvent(request: FallEventRequest): Promise<FallEventResponse> {
  const { motionScore, orientationChange, transcript } = request;

  // Preserve existing validation utility to keep model-side consistency checks available.
  validateFall(motionScore, orientationChange);

  const modelScore = motionScore;
  const rawTranscript = transcript ?? '';
  const normalizedTranscript = normalizeTranscript(rawTranscript);
  const responseType = classifyResponse(normalizedTranscript);
  const { responseWeight, finalScore } = calculateFinalScore(modelScore, responseType);
  const decision = decideAction(responseType, finalScore, modelScore);
  const finalStatus: FallStatus = mapDecisionToStatus(decision);

  console.log('[FallEvent] modelScore:', modelScore);
  console.log('[FallEvent] transcript raw:', rawTranscript || '(empty)');
  console.log('[FallEvent] transcript normalized:', normalizedTranscript || '(empty)');
  console.log('[FallEvent] response type:', responseType);
  console.log('[FallEvent] finalScore:', Number(finalScore.toFixed(3)));
  console.log('[FallEvent] decision:', decision);

  const dispatch = await executeDecisionAction(
    request,
    decision,
    responseType,
    modelScore,
    responseWeight,
    finalScore,
  );

  const sosTriggered = decision !== 'CANCEL' && dispatch.success;

  appendFallEvent({
    eventId: request.eventId,
    createdAt: new Date().toISOString(),
    status: finalStatus,
    sosTriggered,
    dispatch,
    request,
  });

  return { status: finalStatus, sosTriggered, dispatch };
}

export default { validateFall, handleFallEvent };
