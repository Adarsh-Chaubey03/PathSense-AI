export type FallEventState =
  | "IDLE"
  | "MONITORING"
  | "CANDIDATE"
  | "CONFIRMING"
  | "ALERTING"
  | "ESCALATING"
  | "RESOLVED"
  | "FALSE_ALARM";

export type MLDetectionResult = "REAL_FALL" | "FALSE_ALARM" | "NO_FALL" | null;

export interface MLDetectionData {
  result: MLDetectionResult;
  fallProbability: number;
  falseProbability: number;
  sampleCount: number;
  triggeredAt: string;
  safeSignalKey?: string;
}

export interface FallEventContext {
  id: string;
  state: FallEventState;
  startedAt: string;
  updatedAt: string;
  mlDetection?: MLDetectionData;
}

export interface FallEventTransition {
  from: FallEventState;
  to: FallEventState;
  at: string;
  reason: string;
}
