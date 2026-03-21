import {
  Accelerometer,
  Gyroscope,
  type AccelerometerMeasurement,
  type GyroscopeMeasurement,
} from "expo-sensors";

import type {
  MotionState,
  SensorAdapter,
  SensorSample,
  SensorVector,
} from "@/src/services/sensors/sensor-adapter";

const DEFAULT_SAMPLE_RATE_HZ = 50;
const GRAVITY_EARTH = 9.81;

export class RealSensorAdapter implements SensorAdapter {
  private accelerometerSubscription: ReturnType<
    typeof Accelerometer.addListener
  > | null = null;
  private gyroscopeSubscription: ReturnType<typeof Gyroscope.addListener> | null =
    null;
  private latestAccel: SensorVector | null = null;
  private latestGyro: SensorVector | null = null;
  private latestSample: SensorSample | null = null;
  private readonly samples: SensorSample[] = [];
  private readonly maxBufferSize = 500;

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private classifyMotionState(
    accelMagnitude: number,
    gyroMagnitude: number,
  ): MotionState {
    if (gyroMagnitude > 2.0) {
      return "shaking";
    }

    if (gyroMagnitude > 0.5) {
      return "turning";
    }

    if (Math.abs(accelMagnitude - GRAVITY_EARTH) > 2.0) {
      return "walking";
    }

    if (Math.abs(accelMagnitude - GRAVITY_EARTH) < 0.5 && gyroMagnitude < 0.1) {
      return "stationary";
    }

    return "unstable";
  }

  private buildSample(): SensorSample | null {
    if (!this.latestAccel || !this.latestGyro) {
      return null;
    }

    const accelMagnitude = Math.sqrt(
      this.latestAccel.x ** 2 + this.latestAccel.y ** 2 + this.latestAccel.z ** 2,
    );
    const gyroMagnitude = Math.sqrt(
      this.latestGyro.x ** 2 + this.latestGyro.y ** 2 + this.latestGyro.z ** 2,
    );

    const impactIntensity = this.clamp(
      Math.abs(accelMagnitude - GRAVITY_EARTH) / 12,
      0,
      1,
    );
    const rotationIntensity = this.clamp(gyroMagnitude / 6, 0, 1);
    const motionScore = this.clamp(
      1 - (impactIntensity * 0.65 + rotationIntensity * 0.35),
      0,
      1,
    );

    const motionState = this.classifyMotionState(accelMagnitude, gyroMagnitude);
    const orientationChange =
      gyroMagnitude > 0.8 || Math.abs(accelMagnitude - GRAVITY_EARTH) > 3.5;

    return {
      timestampMs: Date.now(),
      accelerometer: this.latestAccel,
      gyroscope: this.latestGyro,
      accelMagnitude,
      gyroMagnitude,
      motionScore,
      orientationChange,
      motionState,
      sampleRateHz: DEFAULT_SAMPLE_RATE_HZ,
      source: "real",
    };
  }

  private pushSample(sample: SensorSample): void {
    this.latestSample = sample;
    this.samples.push(sample);

    if (this.samples.length > this.maxBufferSize) {
      this.samples.splice(0, this.samples.length - this.maxBufferSize);
    }
  }

  private onAccelerometer = (
    measurement: AccelerometerMeasurement,
    onSample: (sample: SensorSample) => void,
  ): void => {
    this.latestAccel = {
      x: measurement.x * GRAVITY_EARTH,
      y: measurement.y * GRAVITY_EARTH,
      z: measurement.z * GRAVITY_EARTH,
    };

    const sample = this.buildSample();
    if (!sample) {
      return;
    }

    this.pushSample(sample);
    onSample(sample);
  };

  private onGyroscope = (measurement: GyroscopeMeasurement): void => {
    this.latestGyro = {
      x: measurement.x,
      y: measurement.y,
      z: measurement.z,
    };
  };

  start(onSample: (sample: SensorSample) => void): void {
    this.stop();

    const updateIntervalMs = Math.round(1000 / DEFAULT_SAMPLE_RATE_HZ);
    Accelerometer.setUpdateInterval(updateIntervalMs);
    Gyroscope.setUpdateInterval(updateIntervalMs);

    this.accelerometerSubscription = Accelerometer.addListener((measurement) =>
      this.onAccelerometer(measurement, onSample),
    );
    this.gyroscopeSubscription = Gyroscope.addListener(this.onGyroscope);
  }

  stop(): void {
    this.accelerometerSubscription?.remove();
    this.gyroscopeSubscription?.remove();
    this.accelerometerSubscription = null;
    this.gyroscopeSubscription = null;
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
