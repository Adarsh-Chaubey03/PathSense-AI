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
const MIN_WINDOW_DURATION_MS = 1800;
const MAX_RETENTION_MS = 4000;
const MAX_BUFFER_SAMPLES = TARGET_WINDOW_SAMPLES * 4;

class SensorWindowStore {
  private samples: RawSensorDataPoint[] = [];

  private trimBuffer(now: number): void {
    const cutoff = now - MAX_RETENTION_MS;
    this.samples = this.samples.filter((sample) => sample.timestamp >= cutoff);

    if (this.samples.length > MAX_BUFFER_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_BUFFER_SAMPLES);
    }
  }

  /**
   * Add a new sensor sample to the window
   * Automatically removes expired samples older than 2 seconds
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

    // Add new sample
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

  private getLatestWindowSamples(
    targetSamples: number = TARGET_WINDOW_SAMPLES,
  ): RawSensorDataPoint[] {
    if (this.samples.length === 0) {
      return [];
    }

    const latestTimestamp = this.samples[this.samples.length - 1].timestamp;
    const windowCutoff = latestTimestamp - WINDOW_DURATION_MS;
    const recentSamples = this.samples.filter(
      (sample) => sample.timestamp >= windowCutoff,
    );

    if (recentSamples.length <= targetSamples) {
      return recentSamples;
    }

    const stride = recentSamples.length / targetSamples;
    const normalizedSamples: RawSensorDataPoint[] = [];

    for (let index = 0; index < targetSamples; index += 1) {
      const sourceIndex = Math.min(
        recentSamples.length - 1,
        Math.floor(index * stride),
      );
      normalizedSamples.push(recentSamples[sourceIndex]);
    }

    return normalizedSamples;
  }

  private normalizeWindowToTargetSamples(
    sourceSamples: RawSensorDataPoint[],
    targetSamples: number = TARGET_WINDOW_SAMPLES,
  ): RawSensorDataPoint[] {
    if (sourceSamples.length === 0 || targetSamples <= 0) {
      return [];
    }

    if (sourceSamples.length === targetSamples) {
      return sourceSamples;
    }

    if (sourceSamples.length === 1) {
      const only = sourceSamples[0];
      return Array.from({ length: targetSamples }, (_, index) => ({
        ...only,
        timestamp: only.timestamp + index,
      }));
    }

    const startTs = sourceSamples[0].timestamp;
    const endTs = sourceSamples[sourceSamples.length - 1].timestamp;
    const duration = Math.max(1, endTs - startTs);

    const normalized: RawSensorDataPoint[] = [];
    let leftIndex = 0;

    for (let i = 0; i < targetSamples; i += 1) {
      const ratio = targetSamples === 1 ? 0 : i / (targetSamples - 1);
      const targetTs = startTs + ratio * duration;

      while (
        leftIndex < sourceSamples.length - 2 &&
        sourceSamples[leftIndex + 1].timestamp < targetTs
      ) {
        leftIndex += 1;
      }

      const left = sourceSamples[leftIndex];
      const right = sourceSamples[Math.min(leftIndex + 1, sourceSamples.length - 1)];

      const segmentDuration = Math.max(1, right.timestamp - left.timestamp);
      const alpha = Math.max(0, Math.min(1, (targetTs - left.timestamp) / segmentDuration));

      normalized.push({
        acc_x: left.acc_x + (right.acc_x - left.acc_x) * alpha,
        acc_y: left.acc_y + (right.acc_y - left.acc_y) * alpha,
        acc_z: left.acc_z + (right.acc_z - left.acc_z) * alpha,
        gyro_x: left.gyro_x + (right.gyro_x - left.gyro_x) * alpha,
        gyro_y: left.gyro_y + (right.gyro_y - left.gyro_y) * alpha,
        gyro_z: left.gyro_z + (right.gyro_z - left.gyro_z) * alpha,
        timestamp: Math.round(targetTs),
      });
    }

    return normalized;
  }

  /**
   * Get the current sensor window data for API call
   */
  getWindowForApiCall(): SensorWindowData | null {
    const rawWindowSamples = this.getLatestWindowSamples();

    if (rawWindowSamples.length === 0) {
      return null;
    }

    const windowDurationMs =
      rawWindowSamples[rawWindowSamples.length - 1].timestamp -
      rawWindowSamples[0].timestamp;

    if (windowDurationMs < MIN_WINDOW_DURATION_MS) {
      return null;
    }

    const windowSamples = this.normalizeWindowToTargetSamples(
      rawWindowSamples,
      TARGET_WINDOW_SAMPLES,
    );

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
   * Get raw samples array for API payload
   */
  getSamplesForApi(): RawSensorDataPoint[] {
    return this.getLatestWindowSamples();
  }

  /**
   * Get model-ready 2-second window in [[acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z], ...]
   */
  getWindowForML(): number[][] {
    const window = this.getWindowForApiCall();
    if (!window) {
      return [];
    }

    return window.samples.map((sample) => [
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
   */
  getBufferFillPercent(): number {
    const fill = (this.getSampleCount() / TARGET_WINDOW_SAMPLES) * 100;
    return Math.max(0, Math.min(100, Math.round(fill)));
  }

  /**
   * Clear all stored sensor data
   */
  clear(): void {
    this.samples = [];
  }

  /**
   * Get current sample count
   */
  getSampleCount(): number {
    return this.getLatestWindowSamples().length;
  }

  getTargetWindowSize(): number {
    return TARGET_WINDOW_SAMPLES;
  }

  getSampleRateHz(): number {
    return TARGET_SAMPLE_RATE_HZ;
  }
}

// Singleton instance
export const sensorWindowStore = new SensorWindowStore();
