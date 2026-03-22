import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, View, ScrollView, Platform, Vibration } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, Button } from '@/components/ui';
import { ConfirmationStatusCard } from '@/src/components/confirmation/ConfirmationStatusCard';
import { CountdownTimer } from '@/src/components/common/CountdownTimer';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { Spacing } from '@/constants/theme';
import { playConfirmationPromptHaptic } from '@/src/services/feedback/haptics';
import { speakConfirmationPrompt } from '@/src/services/feedback/voice';
import {
  getFallEvent,
  resetFallEvent,
  transitionFallEvent,
  getMLDetectionResult,
  clearMLDetectionResult,
} from '@/src/state/fall-event-store';
import { useFallEvent } from '@/src/state/use-fall-event';
import type { MLDetectionData } from '@/src/features/fall-event/event.types';
import { CONFIRMATION_TIMEOUT_SECONDS } from '@/src/features/fall-event/config';

const COUNTDOWN_SECONDS = CONFIRMATION_TIMEOUT_SECONDS;

export default function ConfirmScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const event = useFallEvent();
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [isEscalating, setIsEscalating] = useState(false);
  const [mlData, setMlData] = useState<MLDetectionData | undefined>(undefined);
  const vibrationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const detectionData = getMLDetectionResult();
    setMlData(detectionData);

    const { state } = getFallEvent();

    if (state === 'IDLE') {
      transitionFallEvent('MONITORING', 'Monitoring inferred at confirm entry');
    }

    if (getFallEvent().state === 'MONITORING') {
      transitionFallEvent('CANDIDATE', 'Candidate inferred at confirm screen entry');
    }

    if (getFallEvent().state === 'CANDIDATE') {
      transitionFallEvent('CONFIRMING', 'Confirmation screen active');
    }

    if (getFallEvent().state !== 'CONFIRMING') {
      resetFallEvent();
      transitionFallEvent('MONITORING', 'Recovered confirmation flow state');
      transitionFallEvent('CANDIDATE', 'Recovered candidate state');
      transitionFallEvent('CONFIRMING', 'Recovered confirmation state');
    }

  }, []);

  const stopContinuousPromptHaptic = useCallback(() => {
    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }

    if (Platform.OS === 'android') {
      Vibration.cancel();
    }
  }, []);

  const startContinuousPromptHaptic = useCallback(() => {
    stopContinuousPromptHaptic();

    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 700, 450], true);
      return;
    }

    void playConfirmationPromptHaptic();
    vibrationIntervalRef.current = setInterval(() => {
      void playConfirmationPromptHaptic();
    }, 1200);
  }, [stopContinuousPromptHaptic]);

  useFocusEffect(
    useCallback(() => {
      startContinuousPromptHaptic();
      void speakConfirmationPrompt();

      return () => {
        stopContinuousPromptHaptic();
      };
    }, [startContinuousPromptHaptic, stopContinuousPromptHaptic])
  );

  const getStatusMessage = (): string => {
    if (!mlData) {
      return 'Potential fall detected. Are you okay?';
    }

    const probability = (mlData.fallProbability * 100).toFixed(0);
    const samples = mlData.sampleCount;

    switch (mlData.result) {
      case 'REAL_FALL':
        return `Our AI detected a potential fall with ${probability}% confidence after analyzing ${samples} sensor samples. Please respond within ${COUNTDOWN_SECONDS} seconds.`;
      case 'FALSE_ALARM':
        return 'AI flagged as possible false alarm, but please confirm you\'re okay.';
      case 'NO_FALL':
        return 'AI detected no fall, but edge-filter triggered. Please confirm.';
      default:
        return 'Potential fall detected. Waiting for your response.';
    }
  };

  const handleImOk = (): void => {
    if (getFallEvent().state === 'CONFIRMING') {
      transitionFallEvent('FALSE_ALARM', 'User confirmed safety');
    }
    clearMLDetectionResult();
    router.push('./result');
  };

  const handleEscalate = useCallback(async (): Promise<void> => {
    if (isEscalating) {
      return;
    }

    setIsEscalating(true);

    if (getFallEvent().state === 'CONFIRMING') {
      transitionFallEvent('ALERTING', 'No confirmation response - triggering emergency');
    }

    router.push('./alert');
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="hero" style={styles.title}>
            Are you okay?
          </ThemedText>
        </View>

        {/* Countdown Timer - Prominent */}
        <View style={styles.timerContainer}>
          <CountdownTimer
            secondsLeft={secondsLeft}
            totalSeconds={COUNTDOWN_SECONDS}
            size="lg"
          />
        </View>

        {/* Status Message */}
        <ConfirmationStatusCard
          message={getStatusMessage()}
          variant={secondsLeft <= 10 ? 'danger' : 'warning'}
        />

        {/* ML Info Card */}
        {mlData && (
          <Card variant="outlined" padding="md" style={styles.mlCard}>
            <ThemedText type="label" style={styles.mlLabel}>Detection Details</ThemedText>
            <View style={styles.mlGrid}>
              <View style={styles.mlItem}>
                <ThemedText type="caption">Result</ThemedText>
                <ThemedText type="defaultSemiBold">{mlData.result}</ThemedText>
              </View>
              <View style={styles.mlItem}>
                <ThemedText type="caption">Confidence</ThemedText>
                <ThemedText type="defaultSemiBold">
                  {(mlData.fallProbability * 100).toFixed(0)}%
                </ThemedText>
              </View>
              <View style={styles.mlItem}>
                <ThemedText type="caption">Samples</ThemedText>
                <ThemedText type="defaultSemiBold">{mlData.sampleCount}</ThemedText>
              </View>
            </View>
          </Card>
        )}

        {/* Status Badge */}
        <View style={styles.statusRow}>
          <StatusBadge state={event.state} showDescription={false} />
        </View>

        {/* Action Buttons - Large and Prominent */}
        <View style={styles.buttonsContainer}>
          <Button
            title="YES - I'm OK"
            variant="success"
            size="lg"
            fullWidth
            onPress={handleImOk}
            style={styles.okButton}
          />

          <Button
            title={isEscalating ? 'Triggering SOS...' : 'NO - Send Emergency SOS'}
            variant="danger"
            size="lg"
            fullWidth
            onPress={() => void handleEscalate()}
            disabled={isEscalating}
            loading={isEscalating}
          />
        </View>

        {/* Warning Text */}
        <ThemedText type="caption" style={styles.warningText}>
          If no response in {secondsLeft}s, emergency contacts will be notified automatically
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
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
  },
  timerContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  mlCard: {
    gap: Spacing.md,
  },
  mlLabel: {
    marginBottom: Spacing.xs,
  },
  mlGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mlItem: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusRow: {
    alignItems: 'center',
  },
  buttonsContainer: {
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
  okButton: {
    minHeight: 64,
  },
  warningText: {
    textAlign: 'center',
    opacity: 0.7,
    paddingHorizontal: Spacing.xl,
  },
});
