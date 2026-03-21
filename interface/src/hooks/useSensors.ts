import {useState, useEffect, useCallback} from 'react';
import {sensorService} from '../services/SensorService';
import {gpsService} from '../services/GPSService';
import {cameraService} from '../services/CameraService';
import type {
  IMUData,
  GPSData,
  SensorQuality,
  MotionState,
  DegradationMode,
} from '../types';

interface UseSensorsResult {
  imuData: IMUData | null;
  gpsData: GPSData | null;
  motionState: MotionState;
  sensorQuality: SensorQuality;
  degradationMode: DegradationMode;
  isActive: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

export const useSensors = (): UseSensorsResult => {
  const [imuData, setIMUData] = useState<IMUData | null>(null);
  const [gpsData, setGPSData] = useState<GPSData | null>(null);
  const [motionState, setMotionState] = useState<MotionState>('stationary');
  const [isActive, setIsActive] = useState(false);
  const [sensorQuality, setSensorQuality] = useState<SensorQuality>({
    camera: 1.0,
    imu: 1.0,
    gps: 0.0,
    overall: 0.5,
  });

  const calculateDegradationMode = useCallback(
    (quality: SensorQuality): DegradationMode => {
      if (quality.camera < 0.3) return 'no_camera';
      if (quality.imu < 0.3) return 'weak_imu';
      if (quality.gps < 0.3) return 'no_gps';
      return 'full';
    },
    [],
  );

  const [degradationMode, setDegradationMode] =
    useState<DegradationMode>('full');

  useEffect(() => {
    const unsubscribeIMU = sensorService.subscribe(data => {
      setIMUData(data);
      setMotionState(sensorService.getMotionState());
    });

    const unsubscribeGPS = gpsService.subscribe(data => {
      setGPSData(data);
    });

    return () => {
      unsubscribeIMU();
      unsubscribeGPS();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const newQuality: SensorQuality = {
        camera: cameraService.getQuality(),
        imu: sensorService.isActive() ? 1.0 : 0.0,
        gps: gpsService.getQuality(),
        overall: 0,
      };

      newQuality.overall =
        0.5 * newQuality.camera +
        0.3 * newQuality.imu +
        0.2 * newQuality.gps;

      setSensorQuality(newQuality);
      setDegradationMode(calculateDegradationMode(newQuality));
    }, 500);

    return () => clearInterval(interval);
  }, [calculateDegradationMode]);

  const start = useCallback(async () => {
    await Promise.all([
      sensorService.start(),
      gpsService.start(),
      cameraService.start(),
    ]);
    setIsActive(true);
  }, []);

  const stop = useCallback(() => {
    sensorService.stop();
    gpsService.stop();
    cameraService.stop();
    setIsActive(false);
  }, []);

  return {
    imuData,
    gpsData,
    motionState,
    sensorQuality,
    degradationMode,
    isActive,
    start,
    stop,
  };
};

export default useSensors;
