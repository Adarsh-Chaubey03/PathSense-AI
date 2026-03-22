export type FallStatus = 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN';

export type ResponseType = 'POSITIVE' | 'NEGATIVE' | 'NONE';

export type PriorityDecision = 'CANCEL' | 'CONTACTS' | 'EMERGENCY';

export type MotionState =
  | 'stationary'
  | 'walking'
  | 'turning'
  | 'shaking'
  | 'unstable';

export interface SensorVector {
  x: number;
  y: number;
  z: number;
}

export interface SensorSample {
  timestampMs: number;
  accelerometer: SensorVector;
  gyroscope: SensorVector;
  accelMagnitude: number;
  gyroMagnitude: number;
  motionScore: number;
  orientationChange: boolean;
  motionState: MotionState;
  sampleRateHz: number;
  source: 'real' | 'mock';
}

export interface FallEventRequest {
  eventId: string;
  timestampMs: number;
  motionState: MotionState;
  accelerometer: SensorVector;
  gyroscope: SensorVector;
  accelMagnitude: number;
  gyroMagnitude: number;
  sampleRateHz: number;
  source: 'real' | 'mock';
  snapshot: SensorSample[];
  motionScore: number;
  orientationChange: boolean;
  transcript?: string;
  locationLink?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface FallDispatchSummary {
  attempted: boolean;
  success: boolean;
  recipientsTotal: number;
  recipientsSucceeded: number;
  decision: PriorityDecision;
  responseType: ResponseType;
  modelScore: number;
  responseWeight: number;
  finalScore: number;
  ttsMessage: string;
  smsStatus: 'NOT_SENT' | 'PARTIAL' | 'SENT' | 'FAILED';
}

export interface FallEventResponse {
  status: FallStatus;
  sosTriggered: boolean;
  dispatch: FallDispatchSummary;
}

export interface ValidationResult {
  status: FallStatus;
}
