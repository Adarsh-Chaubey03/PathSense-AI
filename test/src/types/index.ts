/**
 * TypeScript type definitions for IMU Dataset Collection App
 */

// Sensor data point with synchronized timestamp
export interface SensorDataPoint {
  timestamp: number;       // Unix timestamp in milliseconds
  acc_x: number;          // Accelerometer X-axis (m/s²)
  acc_y: number;          // Accelerometer Y-axis (m/s²)
  acc_z: number;          // Accelerometer Z-axis (m/s²)
  gyro_x: number;         // Gyroscope X-axis (rad/s)
  gyro_y: number;         // Gyroscope Y-axis (rad/s)
  gyro_z: number;         // Gyroscope Z-axis (rad/s)
  label: EventLabel;      // Event classification label
}

// Event labels for dataset classification
export type EventLabel =
  | 'phone_drop'
  | 'phone_placed_on_table'
  | 'random_movement'
  | 'unlabeled';

// Raw accelerometer reading from expo-sensors
export interface AccelerometerData {
  x: number;
  y: number;
  z: number;
}

// Raw gyroscope reading from expo-sensors
export interface GyroscopeData {
  x: number;
  y: number;
  z: number;
}

// Combined sensor reading with timestamp
export interface SensorReading {
  timestamp: number;
  accelerometer: AccelerometerData | null;
  gyroscope: GyroscopeData | null;
}

// Recording session metadata
export interface RecordingSession {
  id: string;
  startTime: number;
  endTime: number | null;
  label: EventLabel;
  dataPoints: SensorDataPoint[];
  isActive: boolean;
}

// Saved dataset file metadata
export interface DatasetFile {
  filename: string;
  filepath: string;
  label: EventLabel;
  timestamp: number;
  dataPointCount: number;
  durationMs: number;
  fileSizeBytes: number;
}

// Recording state for UI
export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  currentLabel: EventLabel;
  startTime: number | null;
  dataPointCount: number;
  elapsedTime: number;
}

// Sensor subscription state
export interface SensorState {
  isAvailable: boolean;
  isSubscribed: boolean;
  currentData: SensorReading | null;
  samplingRate: number;
}

// Permission status
export interface PermissionState {
  motionGranted: boolean;
  storageGranted: boolean;
  isChecking: boolean;
  hasChecked: boolean;
}

// App settings
export interface AppSettings {
  samplingIntervalMs: number;  // Target sampling interval (10-20ms for 50-100Hz)
  bufferSize: number;          // Max buffer size before flush
  autoSave: boolean;           // Auto-save when buffer is full
  hapticFeedback: boolean;     // Vibration on start/stop
  showLiveData: boolean;       // Display live sensor values
}

// Upload response from backend
export interface UploadResponse {
  success: boolean;
  message: string;
  fileId?: string;
}

// Navigation params
export type RootStackParamList = {
  Home: undefined;
  DataPreview: { filepath: string };
  Settings: undefined;
};
