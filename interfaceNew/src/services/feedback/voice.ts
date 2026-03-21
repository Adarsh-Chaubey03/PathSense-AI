export async function speakConfirmationPrompt(): Promise<void> {
  console.log("[Voice] Are you okay?");
}

export async function speakEmergencyPrompt(): Promise<void> {
  console.log("[Voice] Alerting emergency contacts now.");
}
