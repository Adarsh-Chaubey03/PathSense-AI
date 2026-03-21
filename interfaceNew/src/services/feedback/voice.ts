import * as Speech from "expo-speech";

async function stopSpeech(): Promise<void> {
  if (await Speech.isSpeakingAsync()) {
    void Speech.stop();
  }
}

export async function speakConfirmationPrompt(): Promise<void> {
  await stopSpeech();
  Speech.speak("Are you okay? Press I am okay if you are safe.", {
    rate: 0.9,
    pitch: 1.0,
  });
}

export async function speakEmergencyPrompt(): Promise<void> {
  await stopSpeech();
  Speech.speak("Emergency alert flow started. Notifying contacts now.", {
    rate: 0.9,
    pitch: 1.0,
  });
}
