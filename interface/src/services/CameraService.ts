import type {CameraFrame} from '../types';
import {SENSOR_CONFIG} from '../constants';

class CameraService {
  private isRunning: boolean = false;
  private frameCallback: ((frame: CameraFrame) => void) | null = null;
  private quality: number = 1.0;
  private lastFrameTime: number = 0;

  async requestPermissions(): Promise<boolean> {
    try {
      const {Camera} = require('react-native-vision-camera');
      const cameraPermission = await Camera.requestCameraPermission();
      return cameraPermission === 'granted';
    } catch (error) {
      console.warn('Failed to request camera permissions:', error);
      return false;
    }
  }

  async getAvailableDevices(): Promise<any[]> {
    try {
      const {Camera} = require('react-native-vision-camera');
      return await Camera.getAvailableCameraDevices();
    } catch (error) {
      console.warn('Failed to get camera devices:', error);
      return [];
    }
  }

  setFrameCallback(callback: (frame: CameraFrame) => void): void {
    this.frameCallback = callback;
  }

  processFrame(frame: any): void {
    if (!this.frameCallback) return;

    const now = Date.now();
    const minInterval = 1000 / SENSOR_CONFIG.camera.fps;

    if (now - this.lastFrameTime < minInterval) {
      return;
    }

    this.lastFrameTime = now;

    const processedFrame: CameraFrame = {
      width: frame.width || SENSOR_CONFIG.camera.width,
      height: frame.height || SENSOR_CONFIG.camera.height,
      timestamp: now,
      data: frame.data || new ArrayBuffer(0),
    };

    this.updateQuality(frame);
    this.frameCallback(processedFrame);
  }

  private updateQuality(frame: any): void {
    let qualityScore = 1.0;

    if (frame.brightness !== undefined) {
      if (frame.brightness < 0.2) {
        qualityScore *= 0.5;
      } else if (frame.brightness < 0.4) {
        qualityScore *= 0.8;
      }
    }

    if (frame.blur !== undefined && frame.blur > 0.5) {
      qualityScore *= 0.7;
    }

    this.quality = qualityScore;
  }

  start(): void {
    this.isRunning = true;
    console.log('Camera service started');
  }

  stop(): void {
    this.isRunning = false;
    this.frameCallback = null;
    console.log('Camera service stopped');
  }

  getQuality(): number {
    return this.quality;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const cameraService = new CameraService();
export default CameraService;
