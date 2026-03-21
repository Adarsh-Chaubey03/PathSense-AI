/**
 * Sensor Service - Manages accelerometer and gyroscope data collection
 *
 * This service handles:
 * - Sensor subscription and unsubscription
 * - Data synchronization between accelerometer and gyroscope
 * - Sampling rate management
 * - Data buffering for efficient collection
 */

import { Accelerometer, Gyroscope } from 'expo-sensors';
import { SENSOR_CONFIG } from '../constants';
import { AccelerometerData, GyroscopeData, SensorDataPoint, EventLabel } from '../types';
import { roundTo, isDuplicateTimestamp } from '../utils';

// Type for sensor update callbacks
type SensorCallback = (data: SensorDataPoint) => void;
type LiveDataCallback = (acc: AccelerometerData | null, gyro: GyroscopeData | null) => void;

class SensorService {
  // Subscriptions
  private accelerometerSubscription: ReturnType<typeof Accelerometer.addListener> | null = null;
  private gyroscopeSubscription: ReturnType<typeof Gyroscope.addListener> | null = null;

  // Latest sensor readings (for synchronization)
  private latestAccelerometer: AccelerometerData | null = null;
  private latestGyroscope: GyroscopeData | null = null;
  private lastAccTimestamp: number = 0;
  private lastGyroTimestamp: number = 0;

  // Data collection state
  private isCollecting: boolean = false;
  private currentLabel: EventLabel = 'unlabeled';
  private lastEmittedTimestamp: number | null = null;

  // Callbacks
  private onDataCallback: SensorCallback | null = null;
  private onLiveDataCallback: LiveDataCallback | null = null;

  // Sampling interval
  private samplingIntervalMs: number = SENSOR_CONFIG.SAMPLING_INTERVAL_MS;

  /**
   * Check if sensors are available on the device
   */
  async checkAvailability(): Promise<{ accelerometer: boolean; gyroscope: boolean }> {
    const [accAvailable, gyroAvailable] = await Promise.all([
      Accelerometer.isAvailableAsync(),
      Gyroscope.isAvailableAsync(),
    ]);

    return {
      accelerometer: accAvailable,
      gyroscope: gyroAvailable,
    };
  }

  /**
   * Set the sampling interval for both sensors
   */
  setSamplingInterval(intervalMs: number): void {
    this.samplingIntervalMs = Math.max(intervalMs, SENSOR_CONFIG.MIN_INTERVAL_MS);

    // Update interval if already subscribed
    if (this.accelerometerSubscription) {
      Accelerometer.setUpdateInterval(this.samplingIntervalMs);
    }
    if (this.gyroscopeSubscription) {
      Gyroscope.setUpdateInterval(this.samplingIntervalMs);
    }
  }

  /**
   * Subscribe to sensor updates
   */
  subscribe(
    onData: SensorCallback,
    onLiveData?: LiveDataCallback
  ): void {
    this.onDataCallback = onData;
    this.onLiveDataCallback = onLiveData || null;

    // Set update intervals
    Accelerometer.setUpdateInterval(this.samplingIntervalMs);
    Gyroscope.setUpdateInterval(this.samplingIntervalMs);

    // Subscribe to accelerometer
    this.accelerometerSubscription = Accelerometer.addListener((data) => {
      this.latestAccelerometer = data;
      this.lastAccTimestamp = Date.now();
      this.emitCombinedData();

      if (this.onLiveDataCallback) {
        this.onLiveDataCallback(data, this.latestGyroscope);
      }
    });

    // Subscribe to gyroscope
    this.gyroscopeSubscription = Gyroscope.addListener((data) => {
      this.latestGyroscope = data;
      this.lastGyroTimestamp = Date.now();
      this.emitCombinedData();

      if (this.onLiveDataCallback) {
        this.onLiveDataCallback(this.latestAccelerometer, data);
      }
    });

    console.log('[SensorService] Subscribed to sensors at', this.samplingIntervalMs, 'ms interval');
  }

  /**
   * Unsubscribe from sensor updates
   */
  unsubscribe(): void {
    if (this.accelerometerSubscription) {
      this.accelerometerSubscription.remove();
      this.accelerometerSubscription = null;
    }

    if (this.gyroscopeSubscription) {
      this.gyroscopeSubscription.remove();
      this.gyroscopeSubscription = null;
    }

    // Reset state
    this.latestAccelerometer = null;
    this.latestGyroscope = null;
    this.onDataCallback = null;
    this.onLiveDataCallback = null;
    this.lastEmittedTimestamp = null;

    console.log('[SensorService] Unsubscribed from sensors');
  }

  /**
   * Start data collection with specified label
   */
  startCollection(label: EventLabel): void {
    this.currentLabel = label;
    this.isCollecting = true;
    this.lastEmittedTimestamp = null;
    console.log('[SensorService] Started collection with label:', label);
  }

  /**
   * Stop data collection
   */
  stopCollection(): void {
    this.isCollecting = false;
    console.log('[SensorService] Stopped collection');
  }

  /**
   * Update the current label for data collection
   */
  setLabel(label: EventLabel): void {
    this.currentLabel = label;
  }

  /**
   * Check if currently collecting data
   */
  getIsCollecting(): boolean {
    return this.isCollecting;
  }

  /**
   * Emit combined sensor data when both readings are available
   * Uses synchronization window to combine accelerometer and gyroscope data
   */
  private emitCombinedData(): void {
    // Only emit if collecting
    if (!this.isCollecting) return;

    // Check if we have recent data from both sensors (within 50ms window)
    const now = Date.now();
    const syncWindow = 50; // ms

    const accFresh = (now - this.lastAccTimestamp) < syncWindow;
    const gyroFresh = (now - this.lastGyroTimestamp) < syncWindow;

    if (!accFresh || !gyroFresh) return;
    if (!this.latestAccelerometer || !this.latestGyroscope) return;

    // Prevent duplicate timestamps
    if (isDuplicateTimestamp(now, this.lastEmittedTimestamp)) return;

    // Create combined data point
    const dataPoint: SensorDataPoint = {
      timestamp: now,
      acc_x: roundTo(this.latestAccelerometer.x, 6),
      acc_y: roundTo(this.latestAccelerometer.y, 6),
      acc_z: roundTo(this.latestAccelerometer.z, 6),
      gyro_x: roundTo(this.latestGyroscope.x, 6),
      gyro_y: roundTo(this.latestGyroscope.y, 6),
      gyro_z: roundTo(this.latestGyroscope.z, 6),
      label: this.currentLabel,
    };

    this.lastEmittedTimestamp = now;

    // Emit to callback
    if (this.onDataCallback) {
      this.onDataCallback(dataPoint);
    }
  }

  /**
   * Get current sampling rate (actual Hz based on interval)
   */
  getSamplingRate(): number {
    return Math.round(1000 / this.samplingIntervalMs);
  }

  /**
   * Get latest sensor readings (for live display)
   */
  getLatestReadings(): { accelerometer: AccelerometerData | null; gyroscope: GyroscopeData | null } {
    return {
      accelerometer: this.latestAccelerometer,
      gyroscope: this.latestGyroscope,
    };
  }
}

// Export singleton instance
export const sensorService = new SensorService();
export default SensorService;
