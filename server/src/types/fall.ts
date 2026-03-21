export type FallStatus = 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN';

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
}

export interface FallDispatchSummary {
  attempted: boolean;
  success: boolean;
  recipientsTotal: number;
  recipientsSucceeded: number;
}

export interface FallEventResponse {
  status: FallStatus;
  sosTriggered: boolean;
  dispatch: FallDispatchSummary;
}

export interface ValidationResult {
  status: FallStatus;
}
