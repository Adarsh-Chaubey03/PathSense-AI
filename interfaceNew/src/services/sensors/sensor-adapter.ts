export type MotionState =
  | "stationary"
  | "walking"
  | "turning"
  | "shaking"
  | "unstable";

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
  source: "real" | "mock";
}

export interface SensorAdapter {
  start(onSample: (sample: SensorSample) => void): void;
  stop(): void;
  getLatestSample(): SensorSample | null;
  getRecentSamples(windowMs: number, maxSamples?: number): SensorSample[];
}
