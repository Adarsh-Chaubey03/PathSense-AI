import type {GPSData} from '../types';
import {SENSOR_CONFIG} from '../constants';

class GPSService {
  private isRunning: boolean = false;
  private watchId: number | null = null;
  private lastGPSData: GPSData | null = null;
  private callbacks: ((data: GPSData) => void)[] = [];
  private quality: number = 1.0;

  async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      const Geolocation = require('@react-native-community/geolocation').default;

      Geolocation.setRNConfiguration({
        skipPermissionRequests: false,
        authorizationLevel: 'whenInUse',
        enableBackgroundLocationUpdates: false,
      });

      this.watchId = Geolocation.watchPosition(
        (position: any) => {
          this.handlePosition(position);
        },
        (error: any) => {
          console.warn('GPS error:', error);
          this.quality = 0;
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 1,
          interval: 1000,
          fastestInterval: 500,
        },
      );

      this.isRunning = true;
      console.log('GPS service started');
    } catch (error) {
      console.warn('Failed to start GPS service:', error);
    }
  }

  stop(): void {
    if (this.watchId !== null) {
      try {
        const Geolocation = require('@react-native-community/geolocation').default;
        Geolocation.clearWatch(this.watchId);
      } catch (error) {
        console.warn('Failed to clear GPS watch:', error);
      }
      this.watchId = null;
    }

    this.isRunning = false;
    console.log('GPS service stopped');
  }

  subscribe(callback: (data: GPSData) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  private handlePosition(position: any): void {
    const {coords, timestamp} = position;

    if (coords.accuracy > SENSOR_CONFIG.gps.minAccuracy) {
      this.quality = Math.max(0.3, 1 - coords.accuracy / 100);
    } else {
      this.quality = 1.0;
    }

    const gpsData: GPSData = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitude: coords.altitude,
      accuracy: coords.accuracy,
      speed: coords.speed,
      heading: coords.heading,
      timestamp,
    };

    if (this.isValidFix(gpsData)) {
      this.lastGPSData = gpsData;
      this.notifyCallbacks();
    }
  }

  private isValidFix(data: GPSData): boolean {
    if (!this.lastGPSData) return true;

    const timeDelta = data.timestamp - this.lastGPSData.timestamp;
    if (timeDelta <= 0) return false;

    const distance = this.calculateDistance(
      this.lastGPSData.latitude,
      this.lastGPSData.longitude,
      data.latitude,
      data.longitude,
    );

    const speed = (distance / timeDelta) * 1000;
    if (speed > 50) {
      console.warn('GPS jump detected, rejecting fix');
      return false;
    }

    return true;
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private notifyCallbacks(): void {
    if (this.lastGPSData) {
      this.callbacks.forEach(cb => cb(this.lastGPSData!));
    }
  }

  getLastGPSData(): GPSData | null {
    return this.lastGPSData;
  }

  getQuality(): number {
    return this.quality;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const gpsService = new GPSService();
export default GPSService;
