export interface SensorReading {
  timestamp: number;
  x: number;
  y: number;
  z: number;
}

export interface IMUData {
  accelerometer: SensorReading;
  gyroscope: SensorReading;
  magnetometer?: SensorReading;
}

export interface GPSData {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

export interface CameraFrame {
  width: number;
  height: number;
  timestamp: number;
  data: ArrayBuffer;
}

export type HazardClass =
  | 'person'
  | 'bicycle'
  | 'motorcycle'
  | 'car'
  | 'pole'
  | 'stairs'
  | 'barrier'
  | 'sign'
  | 'trash_bin'
  | 'door'
  | 'obstacle'
  | 'unknown';

export interface DetectedObject {
  id: string;
  class: HazardClass;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  distance: DistanceBin;
  pathRelevance: number;
}

export type DistanceBin = 'near' | 'medium' | 'far';

export type PriorityLevel = 'high' | 'medium' | 'low';

export type MotionState = 'stationary' | 'walking' | 'turning' | 'shaking' | 'unstable';

export type DegradationMode = 'full' | 'no_gps' | 'weak_imu' | 'no_camera';

export interface SensorQuality {
  camera: number;
  imu: number;
  gps: number;
  overall: number;
}

export interface HazardAlert {
  id: string;
  object: DetectedObject;
  priority: PriorityLevel;
  message: string;
  hapticPattern: HapticPattern;
  timestamp: number;
}

export type HapticPattern = 'stop' | 'left' | 'right' | 'caution';

export interface NavigationState {
  isActive: boolean;
  degradationMode: DegradationMode;
  sensorQuality: SensorQuality;
  motionState: MotionState;
  currentAlert: HazardAlert | null;
  recentAlerts: HazardAlert[];
}

export interface UserSettings {
  voiceEnabled: boolean;
  hapticEnabled: boolean;
  voiceVolume: number;
  hapticIntensity: number;
  speechRate: number;
  alertThreshold: PriorityLevel;
}

export type RootStackParamList = {
  Home: undefined;
  Navigation: undefined;
  Settings: undefined;
};
