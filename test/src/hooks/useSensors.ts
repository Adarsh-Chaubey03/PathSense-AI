/**
 * useSensors Hook - Manages sensor subscription and live data
 *
 * This hook provides:
 * - Sensor availability checking
 * - Live sensor data updates
 * - Subscription lifecycle management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AccelerometerData, GyroscopeData } from '../types';
import { sensorService } from '../services/SensorService';

interface UseSensorsReturn {
  accelerometer: AccelerometerData | null;
  gyroscope: GyroscopeData | null;
  isAvailable: boolean;
  isSubscribed: boolean;
  samplingRate: number;
  error: string | null;
  subscribe: () => void;
  unsubscribe: () => void;
}

export const useSensors = (): UseSensorsReturn => {
  const [accelerometer, setAccelerometer] = useState<AccelerometerData | null>(null);
  const [gyroscope, setGyroscope] = useState<GyroscopeData | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubscribedRef = useRef(false);

  // Check sensor availability on mount
  useEffect(() => {
    const checkAvailability = async () => {
      try {
        const availability = await sensorService.checkAvailability();
        const available = availability.accelerometer && availability.gyroscope;
        setIsAvailable(available);

        if (!available) {
          setError('Sensors not available on this device');
        }
      } catch (err) {
        setError('Failed to check sensor availability');
        setIsAvailable(false);
      }
    };

    checkAvailability();
  }, []);

  // Handle live data updates from sensor service
  const handleLiveData = useCallback((
    acc: AccelerometerData | null,
    gyro: GyroscopeData | null
  ) => {
    if (acc) setAccelerometer(acc);
    if (gyro) setGyroscope(gyro);
  }, []);

  // Subscribe to sensors
  const subscribe = useCallback(() => {
    if (isSubscribedRef.current || !isAvailable) return;

    try {
      // Subscribe with a dummy data callback (we only need live data here)
      sensorService.subscribe(
        () => {}, // Data callback not used in this hook
        handleLiveData
      );
      isSubscribedRef.current = true;
      setIsSubscribed(true);
      setError(null);
    } catch (err) {
      setError('Failed to subscribe to sensors');
    }
  }, [isAvailable, handleLiveData]);

  // Unsubscribe from sensors
  const unsubscribe = useCallback(() => {
    if (!isSubscribedRef.current) return;

    sensorService.unsubscribe();
    isSubscribedRef.current = false;
    setIsSubscribed(false);
    setAccelerometer(null);
    setGyroscope(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isSubscribedRef.current) {
        sensorService.unsubscribe();
      }
    };
  }, []);

  return {
    accelerometer,
    gyroscope,
    isAvailable,
    isSubscribed,
    samplingRate: sensorService.getSamplingRate(),
    error,
    subscribe,
    unsubscribe,
  };
};

export default useSensors;
