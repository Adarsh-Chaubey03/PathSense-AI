import {Platform} from 'react-native';
import type {HapticPattern} from '../types';
import {HAPTIC_PATTERNS} from '../constants';

class HapticFeedbackService {
  private isEnabled: boolean = true;
  private intensity: number = 1.0;

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(1, intensity));
  }

  async trigger(pattern: HapticPattern): Promise<void> {
    if (!this.isEnabled) return;

    try {
      const ReactNativeHapticFeedback = require('react-native-haptic-feedback');
      const options = {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      };

      switch (pattern) {
        case 'stop':
          await ReactNativeHapticFeedback.trigger('impactHeavy', options);
          break;
        case 'left':
          await this.multiPulse('selection', 2, 100);
          break;
        case 'right':
          await this.multiPulse('selection', 3, 100);
          break;
        case 'caution':
          await ReactNativeHapticFeedback.trigger('notificationWarning', options);
          break;
      }
    } catch (error) {
      console.warn('Haptic feedback failed:', error);
    }
  }

  private async multiPulse(
    type: string,
    count: number,
    interval: number,
  ): Promise<void> {
    const ReactNativeHapticFeedback = require('react-native-haptic-feedback');
    const options = {
      enableVibrateFallback: true,
      ignoreAndroidSystemSettings: false,
    };

    for (let i = 0; i < count; i++) {
      await ReactNativeHapticFeedback.trigger(type, options);
      if (i < count - 1) {
        await this.delay(interval);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const hapticService = new HapticFeedbackService();
export default HapticFeedbackService;
