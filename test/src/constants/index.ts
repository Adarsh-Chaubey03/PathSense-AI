/**
 * Application constants for IMU Dataset Collection App
 */

// App information
export const APP_NAME = 'IMU Dataset Collector';
export const APP_VERSION = '1.0.0';

// Sensor sampling configuration
export const SENSOR_CONFIG = {
  // Target sampling interval in milliseconds (100Hz = 10ms, 50Hz = 20ms)
  SAMPLING_INTERVAL_MS: 10,  // 100Hz for high-quality data

  // Minimum acceptable interval (prevents too aggressive sampling)
  MIN_INTERVAL_MS: 8,

  // Maximum recordings buffer size before auto-flush
  BUFFER_SIZE: 5000,

  // Gravity constant for reference
  GRAVITY: 9.81,
} as const;

// Event labels configuration
export const EVENT_LABELS = {
  PHONE_DROP: 'phone_drop',
  PHONE_PLACED: 'phone_placed_on_table',
  RANDOM_MOVEMENT: 'random_movement',
  UNLABELED: 'unlabeled',
} as const;

// Human-readable label names
export const LABEL_DISPLAY_NAMES: Record<string, string> = {
  phone_drop: 'Phone Drop',
  phone_placed_on_table: 'Phone Placed on Table',
  random_movement: 'Random Movement / Spikes',
  unlabeled: 'Unlabeled',
} as const;

// File storage configuration
export const STORAGE_CONFIG = {
  // Directory name for storing datasets
  DATA_DIRECTORY: 'imu_datasets',

  // File extension
  FILE_EXTENSION: '.json',

  // Maximum file size before splitting (5MB)
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,
} as const;

// UI Colors - Dark theme optimized for data collection
export const COLORS = {
  // Primary colors
  background: '#0f0f1a',
  surface: '#1a1a2e',
  surfaceLight: '#252540',

  // Accent colors
  primary: '#6366f1',      // Indigo
  primaryLight: '#818cf8',
  secondary: '#22d3ee',    // Cyan

  // Status colors
  recording: '#ef4444',    // Red for recording
  recordingLight: '#fca5a5',
  success: '#22c55e',      // Green
  warning: '#f59e0b',      // Amber
  error: '#ef4444',        // Red

  // Text colors
  text: '#ffffff',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',

  // Border colors
  border: '#2d2d3d',
  borderLight: '#3d3d5c',

  // Label colors for event types
  labelPhoneDrop: '#ef4444',
  labelPhonePlaced: '#f59e0b',
  labelRandomMovement: '#22d3ee',
  labelUnlabeled: '#64748b',

  // Sensor axis colors
  accX: '#ef4444',  // Red for X
  accY: '#22c55e',  // Green for Y
  accZ: '#3b82f6',  // Blue for Z
  gyroX: '#f97316', // Orange for X
  gyroY: '#a855f7', // Purple for Y
  gyroZ: '#06b6d4', // Cyan for Z
} as const;

// Spacing scale
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// Font sizes
export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// Border radius
export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// Haptic feedback types
export const HAPTIC_TYPES = {
  START_RECORDING: 'impactMedium',
  STOP_RECORDING: 'notificationSuccess',
  ERROR: 'notificationError',
  SELECTION: 'selection',
} as const;

// Permission messages
export const PERMISSION_MESSAGES = {
  MOTION_REQUIRED: 'This app collects motion data to improve fall detection accuracy',
  MOTION_DENIED: 'Motion sensor access is required for data collection. Please enable it in settings.',
  STORAGE_REQUIRED: 'Storage access is needed to save collected datasets.',
  STORAGE_DENIED: 'Storage access was denied. Data cannot be saved locally.',
} as const;

// Recording status messages
export const STATUS_MESSAGES = {
  READY: 'Ready to record',
  RECORDING: 'Recording...',
  STOPPED: 'Recording stopped',
  SAVING: 'Saving data...',
  SAVED: 'Data saved successfully',
  ERROR: 'An error occurred',
} as const;
