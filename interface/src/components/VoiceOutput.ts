import {Platform} from 'react-native';
import {VOICE_CONFIG} from '../constants';

class VoiceOutputService {
  private isEnabled: boolean = true;
  private isSpeaking: boolean = false;
  private volume: number = 1.0;
  private rate: number = VOICE_CONFIG.defaultRate;
  private pitch: number = VOICE_CONFIG.defaultPitch;
  private lastMessage: string = '';
  private lastMessageTime: number = 0;
  private minRepeatInterval: number = 2000;

  async initialize(): Promise<void> {
    try {
      const Tts = require('react-native-tts').default;

      await Tts.setDefaultLanguage(VOICE_CONFIG.language);
      await Tts.setDefaultRate(this.rate);
      await Tts.setDefaultPitch(this.pitch);

      Tts.addEventListener('tts-start', () => {
        this.isSpeaking = true;
      });

      Tts.addEventListener('tts-finish', () => {
        this.isSpeaking = false;
      });

      Tts.addEventListener('tts-cancel', () => {
        this.isSpeaking = false;
      });

      console.log('Voice output service initialized');
    } catch (error) {
      console.warn('Voice output initialization failed:', error);
    }
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  setRate(rate: number): void {
    this.rate = Math.max(0.1, Math.min(2, rate));
    try {
      const Tts = require('react-native-tts').default;
      Tts.setDefaultRate(this.rate);
    } catch (error) {
      console.warn('Failed to set speech rate:', error);
    }
  }

  async speak(message: string, priority: 'high' | 'normal' = 'normal'): Promise<void> {
    if (!this.isEnabled) return;

    const now = Date.now();
    if (
      message === this.lastMessage &&
      now - this.lastMessageTime < this.minRepeatInterval
    ) {
      return;
    }

    try {
      const Tts = require('react-native-tts').default;

      if (priority === 'high' && this.isSpeaking) {
        await Tts.stop();
      }

      await Tts.speak(message);
      this.lastMessage = message;
      this.lastMessageTime = now;
    } catch (error) {
      console.warn('Speech failed:', error);
    }
  }

  async stop(): Promise<void> {
    try {
      const Tts = require('react-native-tts').default;
      await Tts.stop();
      this.isSpeaking = false;
    } catch (error) {
      console.warn('Failed to stop speech:', error);
    }
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }
}

export const voiceService = new VoiceOutputService();
export default VoiceOutputService;
