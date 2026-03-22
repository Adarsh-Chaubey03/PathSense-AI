import * as Speech from "expo-speech";

let cachedVoiceIdentifier: string | undefined;

async function getPreferredVoiceIdentifier(): Promise<string | undefined> {
  if (cachedVoiceIdentifier !== undefined) {
    return cachedVoiceIdentifier;
  }

  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const englishVoices = voices.filter((voice) =>
      voice.language?.toLowerCase().startsWith("en"),
    );

    const preferredVoice =
      englishVoices.find((voice) => {
        const identifier = voice.identifier.toLowerCase();
        const name = (voice.name ?? "").toLowerCase();

        return (
          identifier.includes("enhanced") ||
          identifier.includes("premium") ||
          name.includes("enhanced") ||
          name.includes("natural")
        );
      }) ?? englishVoices[0];

    cachedVoiceIdentifier = preferredVoice?.identifier;
    return cachedVoiceIdentifier;
  } catch {
    cachedVoiceIdentifier = undefined;
    return undefined;
  }
}

async function stopSpeech(): Promise<void> {
  if (await Speech.isSpeakingAsync()) {
    void Speech.stop();
  }
}

export async function speakConfirmationPrompt(): Promise<void> {
  await stopSpeech();
  const voice = await getPreferredVoiceIdentifier();

  Speech.speak("Are you okay? Please tap yes if you are safe.", {
    language: "en-US",
    voice,
    rate: 0.82,
    pitch: 1.02,
  });
}

export async function speakEmergencyPrompt(): Promise<void> {
  await stopSpeech();
  const voice = await getPreferredVoiceIdentifier();

  Speech.speak("Emergency alert started. Notifying your contacts now.", {
    language: "en-US",
    voice,
    rate: 0.84,
    pitch: 1.0,
  });
}
