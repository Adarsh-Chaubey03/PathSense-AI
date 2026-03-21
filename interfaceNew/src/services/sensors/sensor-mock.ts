import type {
  SensorAdapter,
  SensorSample,
} from "@/src/services/sensors/sensor-adapter";

export class MockSensorAdapter implements SensorAdapter {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private latestSample: SensorSample | null = null;
  private readonly samples: SensorSample[] = [];
  private readonly maxBufferSize = 300;

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private pushSample(sample: SensorSample): void {
    this.latestSample = sample;
    this.samples.push(sample);

    if (this.samples.length > this.maxBufferSize) {
      this.samples.splice(0, this.samples.length - this.maxBufferSize);
    }
  }

  start(onSample: (sample: SensorSample) => void): void {
    this.stop();

    this.intervalId = setInterval(() => {
      const spike = Math.random() > 0.85;
      const accelerometer = spike
        ? {
            x: (Math.random() - 0.5) * 10,
            y: (Math.random() - 0.5) * 10,
            z: 15 + Math.random() * 8,
          }
        : {
            x: (Math.random() - 0.5) * 1.2,
            y: (Math.random() - 0.5) * 1.2,
            z: 9.2 + Math.random() * 1.1,
          };

      const gyroscope = spike
        ? {
            x: (Math.random() - 0.5) * 6,
            y: (Math.random() - 0.5) * 6,
            z: (Math.random() - 0.5) * 6,
          }
        : {
            x: (Math.random() - 0.5) * 0.6,
            y: (Math.random() - 0.5) * 0.6,
            z: (Math.random() - 0.5) * 0.6,
          };

      const accelMagnitude = Math.sqrt(
        accelerometer.x ** 2 + accelerometer.y ** 2 + accelerometer.z ** 2,
      );
      const gyroMagnitude = Math.sqrt(
        gyroscope.x ** 2 + gyroscope.y ** 2 + gyroscope.z ** 2,
      );
      const impactIntensity = this.clamp(Math.abs(accelMagnitude - 9.81) / 12, 0, 1);
      const rotationIntensity = this.clamp(gyroMagnitude / 6, 0, 1);
      const motionScore = this.clamp(1 - (impactIntensity * 0.65 + rotationIntensity * 0.35), 0, 1);

      const sample: SensorSample = {
        timestampMs: Date.now(),
        accelerometer,
        gyroscope,
        accelMagnitude,
        gyroMagnitude,
        motionScore,
        orientationChange: spike || gyroMagnitude > 0.8,
        motionState: spike ? "unstable" : "stationary",
        sampleRateHz: 0.67,
        source: "mock",
      };

      this.pushSample(sample);
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

  getRecentSamples(windowMs: number, maxSamples: number = 120): SensorSample[] {
    const cutoff = Date.now() - Math.max(windowMs, 0);
    return this.samples
      .filter((sample) => sample.timestampMs >= cutoff)
      .slice(-Math.max(1, maxSamples));
  }
}
