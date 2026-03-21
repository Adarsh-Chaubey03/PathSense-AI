export interface SensorSample {
  timestamp: string;
  motionScore: number;
  orientationChange: boolean;
}

export interface SensorAdapter {
  start(onSample: (sample: SensorSample) => void): void;
  stop(): void;
  getLatestSample(): SensorSample | null;
}
