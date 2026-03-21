import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ConfirmationStatusCard } from "@/src/components/confirmation/ConfirmationStatusCard";
import { CountdownTimer } from "@/src/components/common/CountdownTimer";
import { StatusBadge } from "@/src/components/common/StatusBadge";
import { playConfirmationPromptHaptic } from "@/src/services/feedback/haptics";
import { speakConfirmationPrompt } from "@/src/services/feedback/voice";
import {
  getFallEvent,
  resetFallEvent,
  transitionFallEvent,
} from "@/src/state/fall-event-store";
import { useFallEvent } from "@/src/state/use-fall-event";

export default function ConfirmScreen() {
  const router = useRouter();
  const event = useFallEvent();
  const [secondsLeft, setSecondsLeft] = useState(10);
  const [isEscalating, setIsEscalating] = useState(false);
  const [backendStatus, setBackendStatus] = useState(
    "ML confirmed a potential real fall. Waiting for your response.",
  );

  useEffect(() => {
    const { state } = getFallEvent();

    if (state === "IDLE") {
      transitionFallEvent("MONITORING", "Monitoring inferred at confirm entry");
    }

    if (getFallEvent().state === "MONITORING") {
      transitionFallEvent(
        "CANDIDATE",
        "Candidate inferred at confirm screen entry",
      );
    }

    if (getFallEvent().state === "CANDIDATE") {
      transitionFallEvent("CONFIRMING", "Confirmation screen active");
    }

    if (getFallEvent().state !== "CONFIRMING") {
      resetFallEvent();
      transitionFallEvent("MONITORING", "Recovered confirmation flow state");
      transitionFallEvent("CANDIDATE", "Recovered candidate state");
      transitionFallEvent("CONFIRMING", "Recovered confirmation state");
    }

    void playConfirmationPromptHaptic();
    void speakConfirmationPrompt();
  }, []);

  const handleImOk = (): void => {
    if (getFallEvent().state === "CONFIRMING") {
      transitionFallEvent("FALSE_ALARM", "User confirmed safety");
    }

    router.push("./result");
  };

  const handleEscalate = useCallback(async (): Promise<void> => {
    if (isEscalating) {
      return;
    }

    setIsEscalating(true);
    setBackendStatus("No user response. Triggering emergency flow...");

    if (getFallEvent().state === "CONFIRMING") {
      transitionFallEvent("ALERTING", "No confirmation response");
    }

    router.push("./alert");
    setIsEscalating(false);
  }, [isEscalating, router]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      void handleEscalate();
      return;
    }

    const timer = setTimeout(() => {
      setSecondsLeft((previous) => previous - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [handleEscalate, secondsLeft]);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Are you okay?</ThemedText>
      <ConfirmationStatusCard message={backendStatus} />
      <CountdownTimer secondsLeft={secondsLeft} />
      <StatusBadge state={event.state} />
      <TouchableOpacity onPress={handleImOk} style={styles.link}>
        <ThemedText type="link">I&apos;m OK</ThemedText>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => void handleEscalate()}
        style={styles.link}
        disabled={isEscalating}
      >
        <ThemedText type="link">
          {isEscalating ? "Escalating..." : "No response / escalate"}
        </ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    gap: 10,
  },
  body: {
    lineHeight: 22,
  },
  link: {
    marginTop: 8,
  },
});
