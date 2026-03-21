import type {
  SensorAdapter,
  SensorSample,
} from "@/src/services/sensors/sensor-adapter";

export class MockSensorAdapter implements SensorAdapter {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private latestSample: SensorSample | null = null;

  start(onSample: (sample: SensorSample) => void): void {
    this.stop();

    this.intervalId = setInterval(() => {
      const spike = Math.random() > 0.85;
      const motionScore = spike ? 0.02 : 0.35 + Math.random() * 0.4;
      const sample: SensorSample = {
        timestamp: new Date().toISOString(),
        motionScore: Math.max(0, Math.min(1, motionScore)),
        orientationChange: spike,
      };

      this.latestSample = sample;
      onSample(sample);
    }, 1500);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getLatestSample(): SensorSample | null {
    return this.latestSample;
  }
}
