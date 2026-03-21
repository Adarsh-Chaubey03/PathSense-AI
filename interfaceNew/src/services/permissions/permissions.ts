import { Audio } from "expo-av";
import * as Location from "expo-location";
import { Accelerometer, Gyroscope } from "expo-sensors";

export interface AppPermissionsState {
  locationGranted: boolean;
  microphoneGranted: boolean;
  accelerometerAvailable: boolean;
  gyroscopeAvailable: boolean;
}

export async function requestAppPermissions(): Promise<AppPermissionsState> {
  const [
    locationPermission,
    microphonePermission,
    accelerometerAvailable,
    gyroscopeAvailable,
  ] = await Promise.all([
    Location.requestForegroundPermissionsAsync(),
    Audio.requestPermissionsAsync(),
    Accelerometer.isAvailableAsync(),
    Gyroscope.isAvailableAsync(),
  ]);

  return {
    locationGranted: locationPermission.status === "granted",
    microphoneGranted: microphonePermission.status === "granted",
    accelerometerAvailable,
    gyroscopeAvailable,
  };
}
