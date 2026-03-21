/**
 * useRecording Hook - Manages recording state and data collection
 *
 * This hook provides:
 * - Recording start/stop functionality
 * - Data buffering and storage
 * - Timer management
 * - Label selection
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { SensorDataPoint, EventLabel, RecordingState, DatasetFile } from '../types';
import { sensorService } from '../services/SensorService';
import { storageService } from '../services/StorageService';
import { SENSOR_CONFIG, HAPTIC_TYPES } from '../constants';

interface UseRecordingReturn {
  recordingState: RecordingState;
  dataBuffer: SensorDataPoint[];
  startRecording: () => void;
  stopRecording: () => Promise<DatasetFile | null>;
  setLabel: (label: EventLabel) => void;
  clearBuffer: () => void;
  error: string | null;
}

export const useRecording = (): UseRecordingReturn => {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    currentLabel: 'phone_drop',
    startTime: null,
    dataPointCount: 0,
    elapsedTime: 0,
  });

  const [error, setError] = useState<string | null>(null);

  // Use refs for mutable data that shouldn't trigger re-renders
  const dataBufferRef = useRef<SensorDataPoint[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // State for UI display of buffer (updated periodically)
  const [dataBuffer, setDataBuffer] = useState<SensorDataPoint[]>([]);

  // Handle incoming sensor data during recording
  const handleSensorData = useCallback((dataPoint: SensorDataPoint) => {
    dataBufferRef.current.push(dataPoint);

    // Update data point count in state (throttled)
    if (dataBufferRef.current.length % 10 === 0) {
      setRecordingState(prev => ({
        ...prev,
        dataPointCount: dataBufferRef.current.length,
      }));
    }
  }, []);

  // Update elapsed time
  const updateElapsedTime = useCallback(() => {
    if (startTimeRef.current) {
      const elapsed = Date.now() - startTimeRef.current;
      setRecordingState(prev => ({
        ...prev,
        elapsedTime: elapsed,
      }));
    }
  }, []);

  // Start recording
  const startRecording = useCallback(() => {
    try {
      // Clear previous buffer
      dataBufferRef.current = [];
      setDataBuffer([]);

      // Set start time
      const now = Date.now();
      startTimeRef.current = now;

      // Subscribe to sensor data
      sensorService.subscribe(handleSensorData);
      sensorService.startCollection(recordingState.currentLabel);

      // Start timer for elapsed time updates
      timerRef.current = setInterval(updateElapsedTime, 100);

      // Update state
      setRecordingState(prev => ({
        ...prev,
        isRecording: true,
        startTime: now,
        dataPointCount: 0,
        elapsedTime: 0,
      }));

      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      setError(null);
      console.log('[useRecording] Recording started');
    } catch (err) {
      setError('Failed to start recording');
      console.error('[useRecording] Start error:', err);
    }
  }, [recordingState.currentLabel, handleSensorData, updateElapsedTime]);

  // Stop recording and save data
  const stopRecording = useCallback(async (): Promise<DatasetFile | null> => {
    try {
      // Stop sensor collection
      sensorService.stopCollection();
      sensorService.unsubscribe();

      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Get collected data
      const collectedData = [...dataBufferRef.current];
      const startTime = startTimeRef.current || Date.now();

      // Update state
      setRecordingState(prev => ({
        ...prev,
        isRecording: false,
        dataPointCount: collectedData.length,
      }));

      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      console.log('[useRecording] Recording stopped. Data points:', collectedData.length);

      // Save to storage if we have data
      if (collectedData.length > 0) {
        const savedFile = await storageService.saveDataset(
          collectedData,
          recordingState.currentLabel,
          startTime
        );

        // Update display buffer with saved data
        setDataBuffer(collectedData);

        return savedFile;
      }

      return null;
    } catch (err) {
      setError('Failed to stop recording');
      console.error('[useRecording] Stop error:', err);

      // Haptic error feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      return null;
    }
  }, [recordingState.currentLabel]);

  // Set label for recording
  const setLabel = useCallback((label: EventLabel) => {
    setRecordingState(prev => ({
      ...prev,
      currentLabel: label,
    }));

    // Update sensor service label if recording
    if (recordingState.isRecording) {
      sensorService.setLabel(label);
    }

    // Haptic selection feedback
    Haptics.selectionAsync();
  }, [recordingState.isRecording]);

  // Clear the data buffer
  const clearBuffer = useCallback(() => {
    dataBufferRef.current = [];
    setDataBuffer([]);
    setRecordingState(prev => ({
      ...prev,
      dataPointCount: 0,
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (recordingState.isRecording) {
        sensorService.stopCollection();
        sensorService.unsubscribe();
      }
    };
  }, []);

  return {
    recordingState,
    dataBuffer,
    startRecording,
    stopRecording,
    setLabel,
    clearBuffer,
    error,
  };
};

export default useRecording;
