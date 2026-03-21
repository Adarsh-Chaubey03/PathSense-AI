export type FallEventState =
  | "IDLE"
  | "MONITORING"
  | "CANDIDATE"
  | "CONFIRMING"
  | "ALERTING"
  | "ESCALATING"
  | "RESOLVED"
  | "FALSE_ALARM";

export interface FallEventContext {
  id: string;
  state: FallEventState;
  startedAt: string;
  updatedAt: string;
}

export interface FallEventTransition {
  from: FallEventState;
  to: FallEventState;
  at: string;
  reason: string;
}
