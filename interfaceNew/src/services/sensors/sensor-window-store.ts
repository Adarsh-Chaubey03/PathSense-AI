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

  /**
   * Get the current sensor window data for API call
   */
  getWindowForApiCall(): SensorWindowData | null {
    const windowSamples = this.getLatestWindowSamples();

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
    return this.getLatestWindowSamples().map((sample) => [
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
