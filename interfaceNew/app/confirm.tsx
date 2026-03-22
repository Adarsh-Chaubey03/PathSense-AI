import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity, View } from "react-native";

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
  getMLDetectionResult,
  clearMLDetectionResult,
} from "@/src/state/fall-event-store";
import { useFallEvent } from "@/src/state/use-fall-event";
import type { MLDetectionData } from "@/src/features/fall-event/event.types";
import { CONFIRMATION_TIMEOUT_SECONDS } from "@/src/features/fall-event/config";

const COUNTDOWN_SECONDS = CONFIRMATION_TIMEOUT_SECONDS;

export default function ConfirmScreen() {
  const router = useRouter();
  const event = useFallEvent();
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [isEscalating, setIsEscalating] = useState(false);
  const [mlData, setMlData] = useState<MLDetectionData | undefined>(undefined);

  useEffect(() => {
    // Get ML detection result from store
    const detectionData = getMLDetectionResult();
    setMlData(detectionData);

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

  const getStatusMessage = (): string => {
    if (!mlData) {
      return "Potential fall detected. Are you okay?";
    }

    const probability = (mlData.fallProbability * 100).toFixed(0);
    const samples = mlData.sampleCount;

    switch (mlData.result) {
      case "REAL_FALL":
        return `ML detected a potential fall (${probability}% confidence, ${samples} samples analyzed). Please respond within ${COUNTDOWN_SECONDS} seconds.`;
      case "FALSE_ALARM":
        return `ML flagged as possible false alarm, but please confirm you're okay.`;
      case "NO_FALL":
        return `ML detected no fall, but edge-filter triggered. Please confirm.`;
      default:
        return "Potential fall detected. Waiting for your response.";
    }
  };

  const handleImOk = (): void => {
    if (getFallEvent().state === "CONFIRMING") {
      transitionFallEvent("FALSE_ALARM", "User confirmed safety");
    }

    // Clear ML detection data
    clearMLDetectionResult();

    router.push("./result");
  };

  const handleEscalate = useCallback(async (): Promise<void> => {
    if (isEscalating) {
      return;
    }

    setIsEscalating(true);

    if (getFallEvent().state === "CONFIRMING") {
      transitionFallEvent(
        "ALERTING",
        "No confirmation response - triggering emergency",
      );
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

      <ConfirmationStatusCard message={getStatusMessage()} />

      {mlData && (
        <View style={styles.mlInfoContainer}>
          <ThemedText style={styles.mlInfo}>
            ML Result: {mlData.result}
          </ThemedText>
          <ThemedText style={styles.mlInfo}>
            Fall probability: {(mlData.fallProbability * 100).toFixed(1)}%
          </ThemedText>
          <ThemedText style={styles.mlInfo}>
            Samples analyzed: {mlData.sampleCount}
          </ThemedText>
        </View>
      )}

      <CountdownTimer secondsLeft={secondsLeft} />

      <StatusBadge state={event.state} />

      <TouchableOpacity onPress={handleImOk} style={styles.okButton}>
        <ThemedText type="link" style={styles.okButtonText}>
          YES - I&apos;m OK
        </ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => void handleEscalate()}
        style={styles.emergencyButton}
        disabled={isEscalating}
      >
        <ThemedText type="link" style={styles.emergencyButtonText}>
          {isEscalating ? "Triggering SOS..." : "NO - Send Emergency SOS"}
        </ThemedText>
      </TouchableOpacity>

      <ThemedText style={styles.timeoutWarning}>
        If no response in {secondsLeft}s, emergency contacts will be notified
      </ThemedText>
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
  mlInfoContainer: {
    backgroundColor: "rgba(33, 150, 243, 0.1)",
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  mlInfo: {
    fontSize: 12,
    opacity: 0.8,
    lineHeight: 18,
  },
  okButton: {
    marginTop: 16,
    backgroundColor: "#4CAF50",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  okButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 18,
  },
  emergencyButton: {
    marginTop: 8,
    backgroundColor: "#F44336",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  emergencyButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 16,
  },
  timeoutWarning: {
    fontSize: 11,
    opacity: 0.6,
    textAlign: "center",
    marginTop: 12,
  },
});
