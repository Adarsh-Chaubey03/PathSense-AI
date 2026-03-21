import {voiceService} from '../components/VoiceOutput';
import {hapticService} from '../components/HapticFeedback';
import type {HazardAlert, UserSettings, HapticPattern} from '../types';
import {ALERT_MESSAGES} from '../constants';

class FeedbackService {
  private settings: UserSettings = {
    voiceEnabled: true,
    hapticEnabled: true,
    voiceVolume: 1.0,
    hapticIntensity: 1.0,
    speechRate: 0.5,
    alertThreshold: 'medium',
  };

  private lastAlertTime: number = 0;
  private minAlertInterval: number = 1500;
  private currentAlert: HazardAlert | null = null;

  async initialize(): Promise<void> {
    await voiceService.initialize();
    console.log('Feedback service initialized');
  }

  updateSettings(settings: Partial<UserSettings>): void {
    this.settings = {...this.settings, ...settings};

    voiceService.setEnabled(this.settings.voiceEnabled);
    voiceService.setVolume(this.settings.voiceVolume);
    voiceService.setRate(this.settings.speechRate);

    hapticService.setEnabled(this.settings.hapticEnabled);
    hapticService.setIntensity(this.settings.hapticIntensity);
  }

  async triggerAlert(alert: HazardAlert): Promise<void> {
    if (!this.shouldTriggerAlert(alert)) {
      return;
    }

    this.currentAlert = alert;
    this.lastAlertTime = Date.now();

    const priority = alert.priority === 'high' ? 'high' : 'normal';

    await Promise.all([
      voiceService.speak(alert.message, priority),
      hapticService.trigger(alert.hapticPattern),
    ]);
  }

  private shouldTriggerAlert(alert: HazardAlert): boolean {
    const now = Date.now();
    if (now - this.lastAlertTime < this.minAlertInterval) {
      if (alert.priority !== 'high') {
        return false;
      }
    }

    const thresholdOrder: Record<string, number> = {
      high: 3,
      medium: 2,
      low: 1,
    };

    const alertLevel = thresholdOrder[alert.priority] || 0;
    const thresholdLevel = thresholdOrder[this.settings.alertThreshold] || 0;

    return alertLevel >= thresholdLevel;
  }

  async speakStatus(message: string): Promise<void> {
    if (this.settings.voiceEnabled) {
      await voiceService.speak(message, 'normal');
    }
  }

  async stopAllFeedback(): Promise<void> {
    await voiceService.stop();
    this.currentAlert = null;
  }

  getCurrentAlert(): HazardAlert | null {
    return this.currentAlert;
  }

  getSettings(): UserSettings {
    return {...this.settings};
  }
}

export const feedbackService = new FeedbackService();
export default FeedbackService;
