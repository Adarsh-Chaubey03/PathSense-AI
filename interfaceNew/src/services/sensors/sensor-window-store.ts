/**
 * Raw sensor data point in the format required by the backend API
 */
export interface RawSensorDataPoint {
  acc_x: number;
  acc_y: number;
  acc_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  timestamp: number;
}

/**
 * Sensor window data structure
 */
export interface SensorWindowData {
  samples: RawSensorDataPoint[];
  windowStartMs: number;
  windowEndMs: number;
  sampleCount: number;
}

const WINDOW_DURATION_MS = 2000; // 2 seconds window
const TARGET_SAMPLE_RATE_HZ = 50;
const TARGET_WINDOW_SAMPLES = 100;
const MAX_RETENTION_MS = 4000;
const MAX_BUFFER_SAMPLES = TARGET_WINDOW_SAMPLES * 4;
const WINDOW_READY_TOLERANCE_MS = 150;

class SensorWindowStore {
  private samples: RawSensorDataPoint[] = [];
  private currentSampleRateHz = TARGET_SAMPLE_RATE_HZ;

  private trimBuffer(now: number): void {
    const cutoff = now - MAX_RETENTION_MS;
    this.samples = this.samples.filter((sample) => sample.timestamp >= cutoff);

    if (this.samples.length > MAX_BUFFER_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_BUFFER_SAMPLES);
    }
  }

  /**
   * Add a new sensor sample to the window.
   * Keeps a rolling in-memory buffer and expires old samples by time.
   */
  addSample(
    acc_x: number,
    acc_y: number,
    acc_z: number,
    gyro_x: number,
    gyro_y: number,
    gyro_z: number,
  ): void {
    const now = Date.now();

    this.samples.push({
      acc_x,
      acc_y,
      acc_z,
      gyro_x,
      gyro_y,
      gyro_z,
      timestamp: now,
    });

    this.trimBuffer(now);
  }

  private getRecentWindowSamples(): RawSensorDataPoint[] {
    if (this.samples.length === 0) {
      return [];
    }

    const latestTimestamp = this.samples[this.samples.length - 1].timestamp;
    const windowCutoff = latestTimestamp - WINDOW_DURATION_MS;

    return this.samples.filter((sample) => sample.timestamp >= windowCutoff);
  }

  private getWindowSpanMs(samples: RawSensorDataPoint[]): number {
    if (samples.length < 2) {
      return 0;
    }

    return Math.max(
      0,
      samples[samples.length - 1].timestamp - samples[0].timestamp,
    );
  }

  private isWindowReady(samples: RawSensorDataPoint[]): boolean {
    if (samples.length < 2) {
      return false;
    }

    return (
      this.getWindowSpanMs(samples) >=
      WINDOW_DURATION_MS - WINDOW_READY_TOLERANCE_MS
    );
  }

  private interpolateValue(
    leftTime: number,
    leftValue: number,
    rightTime: number,
    rightValue: number,
    targetTime: number,
  ): number {
    if (rightTime <= leftTime) {
      return leftValue;
    }

    const ratio = (targetTime - leftTime) / (rightTime - leftTime);
    return leftValue + (rightValue - leftValue) * ratio;
  }

  private interpolateSample(
    left: RawSensorDataPoint,
    right: RawSensorDataPoint,
    targetTime: number,
  ): RawSensorDataPoint {
    return {
      acc_x: this.interpolateValue(
        left.timestamp,
        left.acc_x,
        right.timestamp,
        right.acc_x,
        targetTime,
      ),
      acc_y: this.interpolateValue(
        left.timestamp,
        left.acc_y,
        right.timestamp,
        right.acc_y,
        targetTime,
      ),
      acc_z: this.interpolateValue(
        left.timestamp,
        left.acc_z,
        right.timestamp,
        right.acc_z,
        targetTime,
      ),
      gyro_x: this.interpolateValue(
        left.timestamp,
        left.gyro_x,
        right.timestamp,
        right.gyro_x,
        targetTime,
      ),
      gyro_y: this.interpolateValue(
        left.timestamp,
        left.gyro_y,
        right.timestamp,
        right.gyro_y,
        targetTime,
      ),
      gyro_z: this.interpolateValue(
        left.timestamp,
        left.gyro_z,
        right.timestamp,
        right.gyro_z,
        targetTime,
      ),
      timestamp: Math.round(targetTime),
    };
  }

  private resampleWindow(
    samples: RawSensorDataPoint[],
    targetSamples: number = TARGET_WINDOW_SAMPLES,
  ): RawSensorDataPoint[] {
    if (samples.length === 0) {
      return [];
    }

    if (targetSamples <= 0) {
      return [];
    }

    if (samples.length === 1) {
      return Array.from({ length: targetSamples }, (_, index) => ({
        ...samples[0],
        timestamp: samples[0].timestamp + index,
      }));
    }

    const latestTimestamp = samples[samples.length - 1].timestamp;
    const targetStartTime = latestTimestamp - WINDOW_DURATION_MS;
    const stepMs =
      targetSamples === 1 ? 0 : WINDOW_DURATION_MS / (targetSamples - 1);
    const normalizedSamples: RawSensorDataPoint[] = [];

    let sourceIndex = 0;

    for (let index = 0; index < targetSamples; index += 1) {
      const targetTime = targetStartTime + index * stepMs;

      while (
        sourceIndex < samples.length - 2 &&
        samples[sourceIndex + 1].timestamp < targetTime
      ) {
        sourceIndex += 1;
      }

      const left = samples[sourceIndex];
      const right = samples[Math.min(sourceIndex + 1, samples.length - 1)];

      if (targetTime <= left.timestamp) {
        normalizedSamples.push({
          ...left,
          timestamp: Math.round(targetTime),
        });
        continue;
      }

      if (targetTime >= right.timestamp) {
        normalizedSamples.push({
          ...right,
          timestamp: Math.round(targetTime),
        });
        continue;
      }

      normalizedSamples.push(this.interpolateSample(left, right, targetTime));
    }

    return normalizedSamples;
  }

  /**
   * Get the current sensor window data for API call.
   * Returns a normalized 2-second window only when enough time coverage exists.
   */
  getWindowForApiCall(): SensorWindowData | null {
    const rawWindowSamples = this.getRecentWindowSamples();

    if (!this.isWindowReady(rawWindowSamples)) {
      return null;
    }

    const windowSamples = this.resampleWindow(rawWindowSamples);

    if (windowSamples.length === 0) {
      return null;
    }

    return {
      samples: windowSamples,
      windowStartMs: windowSamples[0].timestamp,
      windowEndMs: windowSamples[windowSamples.length - 1].timestamp,
      sampleCount: windowSamples.length,
    };
  }

  /**
   * Get normalized samples array for API payload.
   * Returns an exact-size model window.
   */
  getSamplesForApi(): RawSensorDataPoint[] {
    const rawWindowSamples = this.getRecentWindowSamples();

    if (!this.isWindowReady(rawWindowSamples)) {
      return [];
    }

    return this.resampleWindow(rawWindowSamples);
  }

  /**
   * Get model-ready 2-second window in
   * [[acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z], ...]
   */
  getWindowForML(): number[][] {
    return this.getSamplesForApi().map((sample) => [
      sample.acc_x,
      sample.acc_y,
      sample.acc_z,
      sample.gyro_x,
      sample.gyro_y,
      sample.gyro_z,
    ]);
  }

  /**
   * Get percentage fill for the active 2-second model window.
   * This is time-based, not raw-sample-count-based, so real devices do not
   * appear stuck at ~90% when their effective sample rate is slightly lower.
   */
  getBufferFillPercent(): number {
    const recentSamples = this.getRecentWindowSamples();
    const spanMs = this.getWindowSpanMs(recentSamples);
    const fill = (spanMs / WINDOW_DURATION_MS) * 100;

    return Math.max(0, Math.min(100, Math.round(fill)));
  }

  /**
   * Clear all stored sensor data
   */
  clear(): void {
    this.samples = [];
  }

  setSampleRateHz(sampleRateHz: number): void {
    if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0) {
      return;
    }

    this.currentSampleRateHz = sampleRateHz;
  }

  resetSampleRateHz(): void {
    this.currentSampleRateHz = TARGET_SAMPLE_RATE_HZ;
  }

  /**
   * Get current raw sample count in the active 2-second window.
   */
  getSampleCount(): number {
    return this.getRecentWindowSamples().length;
  }

  /**
   * Get normalized sample count expected by the ML model.
   */
  getTargetWindowSize(): number {
    return TARGET_WINDOW_SAMPLES;
  }

  getSampleRateHz(): number {
    return this.currentSampleRateHz;
  }
}

// Singleton instance
export const sensorWindowStore = new SensorWindowStore();
