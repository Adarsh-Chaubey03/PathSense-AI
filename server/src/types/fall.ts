export type FallStatus = 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN';

export interface FallEventRequest {
  motionScore: number;
  orientationChange: boolean;
  transcript?: string;
}

export interface FallEventResponse {
  status: FallStatus;
  sosTriggered: boolean;
}

export interface ValidationResult {
  status: FallStatus;
}
