import {
  FallEventContext,
  FallEventState,
  FallEventTransition,
} from "./event.types";

export const ALLOWED_TRANSITIONS: Record<FallEventState, FallEventState[]> = {
  IDLE: ["MONITORING"],
  MONITORING: ["CANDIDATE", "IDLE"],
  CANDIDATE: ["CONFIRMING", "MONITORING", "FALSE_ALARM"],
  CONFIRMING: ["ALERTING", "FALSE_ALARM"],
  ALERTING: ["ESCALATING", "RESOLVED"],
  ESCALATING: ["RESOLVED"],
  RESOLVED: ["IDLE"],
  FALSE_ALARM: ["MONITORING", "IDLE"],
};

export function canTransition(
  from: FallEventState,
  to: FallEventState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function generateEventId(): string {
  const now = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `event_${now}_${random}`;
}

export function createInitialEvent(): FallEventContext {
  const now = new Date().toISOString();

  return {
    id: generateEventId(),
    state: "IDLE",
    startedAt: now,
    updatedAt: now,
  };
}

export function applyTransition(
  event: FallEventContext,
  to: FallEventState,
  reason: string,
): { event: FallEventContext; transition: FallEventTransition } {
  if (!canTransition(event.state, to)) {
    throw new Error(`Invalid transition from ${event.state} to ${to}`);
  }

  const at = new Date().toISOString();
  const transition: FallEventTransition = {
    from: event.state,
    to,
    at,
    reason,
  };

  const nextEvent: FallEventContext = {
    ...event,
    state: to,
    updatedAt: at,
  };

  return {
    event: nextEvent,
    transition,
  };
}
