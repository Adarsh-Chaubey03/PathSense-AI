import type { FallStatus, FallEventRequest, FallEventResponse, ValidationResult } from '../types/fall.ts';
import { send_alert_to_contacts } from './contactManager.ts';

const CONFIRMATION_TIMEOUT_MS = 5000;

const POSITIVE_RESPONSES = [
  'yes',
  'yeah',
  'yep',
  'i am fine',
  "i'm fine",
  'i am okay',
  "i'm okay",
  'all good',
  'no problem',
  'fine',
  'okay',
  'ok',
];

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

function isUserOkay(transcript: string | undefined): boolean {
  if (!transcript || transcript.trim().length === 0) {
    return false;
  }

  const normalizedTranscript = transcript.toLowerCase().trim();

  // Check for negation patterns that override positive responses
  const negationPatterns = [/\bnot\s+okay\b/, /\bnot\s+fine\b/, /\bnot\s+ok\b/, /n't\s+okay\b/, /n't\s+fine\b/, /n't\s+ok\b/, /\bhelp\b/, /\bneed\s+help\b/, /\bhurt\b/, /\bpain\b/, /\bfell\b/, /\bfallen\b/];
  if (negationPatterns.some((pattern) => pattern.test(normalizedTranscript))) {
    return false;
  }

  return POSITIVE_RESPONSES.some((response) => normalizedTranscript.includes(response));
}

async function waitForUserConfirmation(transcript?: string): Promise<string | undefined> {
  if (transcript !== undefined) {
    return transcript;
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(undefined);
    }, CONFIRMATION_TIMEOUT_MS);
  });
}

async function triggerSOS(): Promise<void> {
  const message = 'EMERGENCY ALERT: Possible fall detected. Immediate assistance required.';
  await send_alert_to_contacts(message);
}

/**
 * Handles the complete fall event workflow.
 */
export async function handleFallEvent(request: FallEventRequest): Promise<FallEventResponse> {
  const { motionScore, orientationChange, transcript } = request;

  const validationResult = validateFall(motionScore, orientationChange);
  let finalStatus: FallStatus = validationResult.status;
  let sosTriggered = false;

  console.log('[FallEvent] Validation result:', validationResult.status);

  if (finalStatus === 'UNCERTAIN') {
    const userResponse = await waitForUserConfirmation(transcript);
    console.log('[FallEvent] Transcript received:', userResponse || '(empty)');

    if (isUserOkay(userResponse)) {
      finalStatus = 'REJECTED';
      console.log('[FallEvent] Decision: User is okay, canceling SOS');
    } else {
      finalStatus = 'CONFIRMED';
      console.log('[FallEvent] Decision: User needs help, triggering SOS');
    }
  }

  if (finalStatus === 'CONFIRMED') {
    await triggerSOS();
    sosTriggered = true;
    console.log('[FallEvent] SOS triggered');
  }

  return { status: finalStatus, sosTriggered };
}

export default { validateFall, handleFallEvent };
