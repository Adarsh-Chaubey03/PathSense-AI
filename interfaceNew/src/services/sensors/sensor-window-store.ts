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

class SensorWindowStore {
  private samples: RawSensorDataPoint[] = [];

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

    // Remove expired samples (older than 2 seconds)
    const cutoff = now - WINDOW_DURATION_MS;
    this.samples = this.samples.filter((s) => s.timestamp >= cutoff);
  }

  /**
   * Get the current sensor window data for API call
   */
  getWindowForApiCall(): SensorWindowData | null {
    if (this.samples.length === 0) {
      return null;
    }

    return {
      samples: [...this.samples],
      windowStartMs: this.samples[0].timestamp,
      windowEndMs: this.samples[this.samples.length - 1].timestamp,
      sampleCount: this.samples.length,
    };
  }

  /**
   * Get raw samples array for API payload
   */
  getSamplesForApi(): RawSensorDataPoint[] {
    return [...this.samples];
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
    return this.samples.length;
  }
}

// Singleton instance
export const sensorWindowStore = new SensorWindowStore();
