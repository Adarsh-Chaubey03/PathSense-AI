/**
 * Utility functions for IMU Dataset Collection App
 */

import { EventLabel } from '../types';
import { COLORS, LABEL_DISPLAY_NAMES } from '../constants';

/**
 * Generates a unique ID based on timestamp and random string
 */
export const generateId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomStr}`;
};

/**
 * Formats a timestamp in milliseconds to a readable date-time string
 */
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toISOString().replace('T', '_').replace(/[:.]/g, '-').slice(0, -5);
};

/**
 * Formats duration in milliseconds to MM:SS format
 */
export const formatDuration = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Formats duration with milliseconds (MM:SS.mmm)
 */
export const formatDurationWithMs = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

/**
 * Generates filename for dataset export
 * Format: eventType_timestamp.json
 */
export const generateFilename = (label: EventLabel, timestamp: number): string => {
  const formattedTime = formatTimestamp(timestamp);
  return `${label}_${formattedTime}.json`;
};

/**
 * Formats file size in bytes to human-readable string
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
};

/**
 * Rounds a number to specified decimal places
 */
export const roundTo = (value: number, decimals: number = 4): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

/**
 * Gets display name for event label
 */
export const getLabelDisplayName = (label: EventLabel): string => {
  return LABEL_DISPLAY_NAMES[label] || label;
};

/**
 * Gets color for event label
 */
export const getLabelColor = (label: EventLabel): string => {
  switch (label) {
    case 'phone_drop':
      return COLORS.labelPhoneDrop;
    case 'phone_placed_on_table':
      return COLORS.labelPhonePlaced;
    case 'random_movement':
      return COLORS.labelRandomMovement;
    default:
      return COLORS.labelUnlabeled;
  }
};

/**
 * Validates sensor data point for completeness
 */
export const isValidDataPoint = (data: {
  acc_x?: number;
  acc_y?: number;
  acc_z?: number;
  gyro_x?: number;
  gyro_y?: number;
  gyro_z?: number;
}): boolean => {
  return (
    typeof data.acc_x === 'number' &&
    typeof data.acc_y === 'number' &&
    typeof data.acc_z === 'number' &&
    typeof data.gyro_x === 'number' &&
    typeof data.gyro_y === 'number' &&
    typeof data.gyro_z === 'number' &&
    !isNaN(data.acc_x) &&
    !isNaN(data.acc_y) &&
    !isNaN(data.acc_z) &&
    !isNaN(data.gyro_x) &&
    !isNaN(data.gyro_y) &&
    !isNaN(data.gyro_z)
  );
};

/**
 * Clamps a value between min and max
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

/**
 * Debounce function for limiting rapid calls
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Calculates acceleration magnitude from x, y, z components
 */
export const calculateMagnitude = (x: number, y: number, z: number): number => {
  return Math.sqrt(x * x + y * y + z * z);
};

/**
 * Checks if a timestamp is a duplicate (within 1ms threshold)
 */
export const isDuplicateTimestamp = (
  newTimestamp: number,
  lastTimestamp: number | null,
  thresholdMs: number = 1
): boolean => {
  if (lastTimestamp === null) return false;
  return Math.abs(newTimestamp - lastTimestamp) < thresholdMs;
};
