/**
 * Permission Service - Handles permission requests and status checking
 *
 * Note: expo-sensors doesn't require explicit permissions on most platforms,
 * but we handle the permission UI flow for better user experience.
 */

import { Platform, Alert, Linking } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';

export interface PermissionStatus {
  sensorsAvailable: boolean;
  accelerometerAvailable: boolean;
  gyroscopeAvailable: boolean;
  errorMessage: string | null;
}

class PermissionService {
  /**
   * Check and request all required permissions
   */
  async requestPermissions(): Promise<PermissionStatus> {
    const status: PermissionStatus = {
      sensorsAvailable: false,
      accelerometerAvailable: false,
      gyroscopeAvailable: false,
      errorMessage: null,
    };

    try {
      // Check accelerometer availability
      const accAvailable = await Accelerometer.isAvailableAsync();
      status.accelerometerAvailable = accAvailable;

      // Check gyroscope availability
      const gyroAvailable = await Gyroscope.isAvailableAsync();
      status.gyroscopeAvailable = gyroAvailable;

      // Both sensors must be available
      status.sensorsAvailable = accAvailable && gyroAvailable;

      if (!status.sensorsAvailable) {
        status.errorMessage = this.getUnavailableMessage(accAvailable, gyroAvailable);
      }

      console.log('[PermissionService] Sensor availability:', {
        accelerometer: accAvailable,
        gyroscope: gyroAvailable,
      });

      return status;
    } catch (error) {
      console.error('[PermissionService] Error checking permissions:', error);
      status.errorMessage = 'Failed to check sensor availability. Please restart the app.';
      return status;
    }
  }

  /**
   * Show permission explanation dialog
   */
  showPermissionExplanation(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(
        'Motion Sensor Access Required',
        'This app collects motion data to improve fall detection accuracy. ' +
        'The accelerometer and gyroscope data will be used to train machine learning models ' +
        'that can detect falls more accurately.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: 'Continue',
            onPress: () => resolve(true),
          },
        ]
      );
    });
  }

  /**
   * Show settings dialog when permissions are denied
   */
  showSettingsDialog(): void {
    Alert.alert(
      'Sensors Unavailable',
      'Motion sensors are required for this app to function. ' +
      'Please ensure your device has accelerometer and gyroscope sensors.',
      [
        {
          text: 'OK',
          style: 'default',
        },
        {
          text: 'Open Settings',
          onPress: () => {
            if (Platform.OS === 'ios') {
              Linking.openURL('app-settings:');
            } else {
              Linking.openSettings();
            }
          },
        },
      ]
    );
  }

  /**
   * Get appropriate error message based on sensor availability
   */
  private getUnavailableMessage(accAvailable: boolean, gyroAvailable: boolean): string {
    if (!accAvailable && !gyroAvailable) {
      return 'Neither accelerometer nor gyroscope are available on this device.';
    }
    if (!accAvailable) {
      return 'Accelerometer is not available on this device.';
    }
    if (!gyroAvailable) {
      return 'Gyroscope is not available on this device.';
    }
    return 'Required sensors are not available.';
  }

  /**
   * Check if we're running on a real device vs emulator
   * (Emulators often don't have real sensor data)
   */
  isRealDevice(): boolean {
    // This is a heuristic - expo-device could be used for more accurate detection
    return Platform.OS !== 'web';
  }
}

// Export singleton instance
export const permissionService = new PermissionService();
export default PermissionService;
