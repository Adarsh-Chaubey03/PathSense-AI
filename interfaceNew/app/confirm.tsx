import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button, Card } from "@/components/ui";
import { BorderRadius, Spacing } from "@/constants/theme";
import { useThemeColor } from "@/hooks/use-theme-color";
import { ConfirmationStatusCard } from "@/src/components/confirmation/ConfirmationStatusCard";
import { CountdownTimer } from "@/src/components/common/CountdownTimer";
import { StatusBadge } from "@/src/components/common/StatusBadge";
import { playConfirmationPromptHaptic } from "@/src/services/feedback/haptics";
import { speakConfirmationPrompt } from "@/src/services/feedback/voice";
import { cacheSafeSignalKey } from "@/src/services/storage/safe-fall-cache";
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
  const insets = useSafeAreaInsets();
  const event = useFallEvent();
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [isEscalating, setIsEscalating] = useState(false);
  const [mlData, setMlData] = useState<MLDetectionData | undefined>(undefined);
  const safeConfirmedRef = useRef(false);

  const successColor = useThemeColor({}, "success");
  const dangerColor = useThemeColor({}, "danger");
  const warningColor = useThemeColor({}, "warning");

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

  const handleImOk = useCallback(async (): Promise<void> => {
    if (safeConfirmedRef.current) {
      return;
    }

    safeConfirmedRef.current = true;

    if (getFallEvent().state === "CONFIRMING") {
      transitionFallEvent("FALSE_ALARM", "User confirmed safety");
    }

    setSecondsLeft(0);

    if (mlData?.safeSignalKey) {
      void cacheSafeSignalKey(mlData.safeSignalKey);
    }

    // Clear ML detection data
    clearMLDetectionResult();

    router.push("./result");
  }, [mlData?.safeSignalKey, router]);

  const handleEscalate = useCallback(async (): Promise<void> => {
    if (isEscalating || safeConfirmedRef.current) {
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
    if (safeConfirmedRef.current) {
      return;
    }

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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ThemedText type="hero" style={styles.title}>
            Are you okay?
          </ThemedText>
          <ThemedText type="caption" style={styles.subtitle}>
            Respond to confirm your safety before the countdown ends.
          </ThemedText>
          <StatusBadge state={event.state} />
        </View>

        <ConfirmationStatusCard
          message={getStatusMessage()}
          variant={secondsLeft <= 10 ? "danger" : "warning"}
        />

        {mlData && (
          <Card variant="outlined" padding="md" style={styles.mlInfoContainer}>
            <ThemedText type="label" style={styles.cardTitle}>
              ML Detection Summary
            </ThemedText>
            <View style={styles.mlRow}>
              <ThemedText type="caption">Model result</ThemedText>
              <ThemedText type="defaultSemiBold">{mlData.result}</ThemedText>
            </View>
            <View style={styles.mlRow}>
              <ThemedText type="caption">Fall probability</ThemedText>
              <ThemedText type="defaultSemiBold">
                {(mlData.fallProbability * 100).toFixed(1)}%
              </ThemedText>
            </View>
            <View style={styles.mlRow}>
              <ThemedText type="caption">Samples analyzed</ThemedText>
              <ThemedText type="defaultSemiBold">
                {mlData.sampleCount}
              </ThemedText>
            </View>
          </Card>
        )}

        <Card variant="glass" padding="lg" style={styles.timerCard}>
          <CountdownTimer secondsLeft={secondsLeft} />
        </Card>

        <View style={styles.actions}>
          <Button
            title="YES - I’m OK"
            variant="success"
            size="lg"
            fullWidth
            onPress={() => void handleImOk()}
          />
          <Button
            title={
              isEscalating ? "Triggering SOS..." : "NO - Send Emergency SOS"
            }
            variant="danger"
            size="lg"
            fullWidth
            onPress={() => void handleEscalate()}
            disabled={isEscalating}
            loading={isEscalating}
          />
        </View>

        <Card variant="outlined" padding="md">
          <ThemedText
            type="caption"
            style={[
              styles.timeoutWarning,
              { color: secondsLeft <= 10 ? dangerColor : warningColor },
            ]}
          >
            If no response in {secondsLeft}s, emergency contacts will be
            notified.
          </ThemedText>
        </Card>

        <ThemedText
          type="caption"
          style={[styles.helperText, { color: successColor }]}
        >
          Tap “YES - I’m OK” to immediately cancel escalation.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  header: {
    gap: Spacing.sm,
  },
  title: {
    lineHeight: 42,
  },
  subtitle: {
    lineHeight: 20,
    maxWidth: 320,
  },
  mlInfoContainer: {
    gap: Spacing.sm,
  },
  cardTitle: {
    marginBottom: Spacing.xs,
  },
  mlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  timerCard: {
    alignItems: "center",
    borderRadius: BorderRadius.xl,
  },
  actions: {
    gap: Spacing.md,
  },
  timeoutWarning: {
    textAlign: "center",
    lineHeight: 20,
  },
  helperText: {
    textAlign: "center",
    opacity: 0.9,
  },
});
