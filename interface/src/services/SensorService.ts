import type {IMUData, SensorReading, MotionState} from '../types';
import {SENSOR_CONFIG} from '../constants';

class SensorService {
  private isRunning: boolean = false;
  private accelerometerSubscription: any = null;
  private gyroscopeSubscription: any = null;
  private lastIMUData: IMUData | null = null;
  private motionState: MotionState = 'stationary';
  private callbacks: ((data: IMUData) => void)[] = [];

  async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      const {
        accelerometer,
        gyroscope,
        setUpdateIntervalForType,
        SensorTypes,
      } = require('react-native-sensors');

      const updateInterval = 1000 / SENSOR_CONFIG.imu.sampleRate;
      setUpdateIntervalForType(SensorTypes.accelerometer, updateInterval);
      setUpdateIntervalForType(SensorTypes.gyroscope, updateInterval);

      this.accelerometerSubscription = accelerometer.subscribe({
        next: (data: SensorReading) => {
          this.updateAccelerometer(data);
        },
        error: (error: Error) => {
          console.warn('Accelerometer error:', error);
        },
      });

      this.gyroscopeSubscription = gyroscope.subscribe({
        next: (data: SensorReading) => {
          this.updateGyroscope(data);
        },
        error: (error: Error) => {
          console.warn('Gyroscope error:', error);
        },
      });

      this.isRunning = true;
      console.log('Sensor service started');
    } catch (error) {
      console.warn('Failed to start sensor service:', error);
    }
  }

  stop(): void {
    if (this.accelerometerSubscription) {
      this.accelerometerSubscription.unsubscribe();
      this.accelerometerSubscription = null;
    }

    if (this.gyroscopeSubscription) {
      this.gyroscopeSubscription.unsubscribe();
      this.gyroscopeSubscription = null;
    }

    this.isRunning = false;
    console.log('Sensor service stopped');
  }

  subscribe(callback: (data: IMUData) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  private updateAccelerometer(data: SensorReading): void {
    if (!this.lastIMUData) {
      this.lastIMUData = {
        accelerometer: data,
        gyroscope: {timestamp: 0, x: 0, y: 0, z: 0},
      };
    } else {
      this.lastIMUData.accelerometer = data;
    }
    this.notifyCallbacks();
  }

  private updateGyroscope(data: SensorReading): void {
    if (!this.lastIMUData) {
      this.lastIMUData = {
        accelerometer: {timestamp: 0, x: 0, y: 0, z: 0},
        gyroscope: data,
      };
    } else {
      this.lastIMUData.gyroscope = data;
    }
    this.updateMotionState();
    this.notifyCallbacks();
  }

  private updateMotionState(): void {
    if (!this.lastIMUData) return;

    const {accelerometer, gyroscope} = this.lastIMUData;
    const accelMag = Math.sqrt(
      accelerometer.x ** 2 + accelerometer.y ** 2 + accelerometer.z ** 2,
    );
    const gyroMag = Math.sqrt(
      gyroscope.x ** 2 + gyroscope.y ** 2 + gyroscope.z ** 2,
    );

    if (gyroMag > 2.0) {
      this.motionState = 'shaking';
    } else if (gyroMag > 0.5) {
      this.motionState = 'turning';
    } else if (Math.abs(accelMag - 9.81) > 2.0) {
      this.motionState = 'walking';
    } else if (Math.abs(accelMag - 9.81) < 0.5 && gyroMag < 0.1) {
      this.motionState = 'stationary';
    } else {
      this.motionState = 'unstable';
    }
  }

  private notifyCallbacks(): void {
    if (this.lastIMUData) {
      this.callbacks.forEach(cb => cb(this.lastIMUData!));
    }
  }

  getMotionState(): MotionState {
    return this.motionState;
  }

  getLastIMUData(): IMUData | null {
    return this.lastIMUData;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const sensorService = new SensorService();
export default SensorService;
