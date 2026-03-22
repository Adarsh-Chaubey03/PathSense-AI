import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, Button, InfoCard } from '@/components/ui';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Spacing, BorderRadius, Palette } from '@/constants/theme';
import type { SensorSample } from '@/src/services/sensors/sensor-adapter';
import { services } from '@/src/services';
import { sensorWindowStore } from '@/src/services/sensors/sensor-window-store';
import {
  postFallDetectWithRetry,
  type FallDetectResult,
} from '@/src/services/api/fall-events';
import { getApiBaseUrl } from '@/src/services/api/client';
import {
  getFallEvent,
  resetFallEvent,
  transitionFallEvent,
  setMLDetectionResult,
} from '@/src/state/fall-event-store';
import { useFallEvent } from '@/src/state/use-fall-event';
import {
  evaluateWithEdgeFilter,
  getEdgeFilterThresholds,
  resetEdgeFilter,
  type DetectionDecision,
} from '@/src/features/fall-event/detection';

const EDGE_THRESHOLDS = getEdgeFilterThresholds();

export default function MonitoringScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const event = useFallEvent();
  const [sample, setSample] = useState<SensorSample | null>(null);
  const [edgeStatus, setEdgeStatus] = useState<DetectionDecision | null>(null);
  const [bufferFill, setBufferFill] = useState(0);
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [monitoringLogs, setMonitoringLogs] = useState<string[]>([]);
  const apiBaseUrl = getApiBaseUrl();

  const successColor = useThemeColor({}, 'success');
  const primaryColor = useThemeColor({}, 'primary');
  const accentColor = useThemeColor({}, 'accent');
  const warningColor = useThemeColor({}, 'warning');
  const cardBg = useThemeColor({}, 'card');

  const isProcessingRef = useRef(false);
  const inTriggerRangeRef = useRef(false);

  const appendMonitoringLog = useCallback((message: string): void => {
    const stamp = new Date().toLocaleTimeString();
    const entry = `[${stamp}] ${message}`;
    setMonitoringLogs((prev) => [...prev.slice(-79), entry]);
  }, []);

  const routeToConfirmation = useCallback(
    (reason: string) => {
      const { state } = getFallEvent();

      if (
        state !== 'IDLE' &&
        state !== 'MONITORING' &&
        state !== 'CANDIDATE' &&
        state !== 'CONFIRMING'
      ) {
        resetFallEvent();
        transitionFallEvent('MONITORING', 'Reset stale flow before ML-confirmed fall');
      }

      if (state === 'IDLE') {
        transitionFallEvent('MONITORING', 'Edge filter activated monitoring');
      }

      if (getFallEvent().state === 'MONITORING') {
        transitionFallEvent('CANDIDATE', 'Edge AI detected potential fall pattern');
      }

      if (getFallEvent().state === 'CANDIDATE') {
        transitionFallEvent('CONFIRMING', reason);
      }

      router.push('./confirm');
    },
    [router]
  );

  const storeMLResultAndNavigate = useCallback(
    (
      result: FallDetectResult,
      fallProb: number,
      falseProb: number,
      sampleCount: number,
      reason: string
    ): void => {
      setMLDetectionResult({
        result,
        fallProbability: fallProb,
        falseProbability: falseProb,
        sampleCount,
        triggeredAt: new Date().toISOString(),
      });

      if (result === 'REAL_FALL') {
        appendMonitoringLog('Backend confirmed REAL_FALL -> opening Are you OK page');
        routeToConfirmation(reason);
      } else {
        setApiStatus(`ML determined: ${result} - continuing monitoring`);
        appendMonitoringLog(`Backend result ${result} -> staying on monitoring and resetting edge filter`);
        resetEdgeFilter();
      }
    },
    [appendMonitoringLog, routeToConfirmation]
  );

  const processMLDetection = useCallback(
    async (reason: string): Promise<void> => {
      if (isProcessingRef.current) {
        appendMonitoringLog('ML API call skipped: previous request still in progress');
        return;
      }
      isProcessingRef.current = true;

      try {
        const windowPayload = sensorWindowStore.getWindowForApiCall();
        const window = sensorWindowStore.getWindowForML();
        const sampleCount = window.length;
        const bufferedSamples = sensorWindowStore.getSampleCount();
        const targetWindowSize = sensorWindowStore.getTargetWindowSize();

        if (!windowPayload || sampleCount !== targetWindowSize) {
          setApiStatus(`Insufficient window: ${bufferedSamples}/${targetWindowSize}`);
          appendMonitoringLog(
            `ML API not called: window not ready (${bufferedSamples}/${targetWindowSize})`
          );
          isProcessingRef.current = false;
          return;
        }

        setApiStatus(`Analyzing ${sampleCount} samples...`);
        appendMonitoringLog(`Trigger API call: window=${sampleCount}x6`);

        const response = await postFallDetectWithRetry({
          window,
          sampleCount: windowPayload.sampleCount,
          sampleRateHz: sensorWindowStore.getSampleRateHz(),
          windowStartMs: windowPayload.windowStartMs,
          windowEndMs: windowPayload.windowEndMs,
          segment: {
            rearPre: 40,
            core: 20,
            post: 40,
            total: 100,
          },
        });

        if (!response) {
          setApiStatus('ML API failed - treating as potential fall');
          appendMonitoringLog('ML API call failed; fallback REAL_FALL flow applied');
          storeMLResultAndNavigate('REAL_FALL', 0.5, 0.5, sampleCount, reason);
          return;
        }

        const { result, fall_prob, false_prob } = response;
        setApiStatus(`Result: ${result} (${(fall_prob * 100).toFixed(0)}%)`);
        appendMonitoringLog(
          `ML API response: ${result}, fall=${(fall_prob * 100).toFixed(1)}%`
        );

        storeMLResultAndNavigate(result, fall_prob, false_prob, sampleCount, reason);
      } catch {
        setApiStatus('Error processing fall detection');
        appendMonitoringLog('ML API error during processing; fallback REAL_FALL flow applied');
        storeMLResultAndNavigate('REAL_FALL', 0.5, 0.5, 0, reason);
      } finally {
        isProcessingRef.current = false;
      }
    },
    [appendMonitoringLog, storeMLResultAndNavigate]
  );

  const handleSensorSample = useCallback(
    (newSample: SensorSample) => {
      setSample(newSample);
      setBufferFill(sensorWindowStore.getBufferFillPercent());

      const decision = evaluateWithEdgeFilter(newSample);
      setEdgeStatus(decision);

      const accMagG = newSample.accelMagnitude / EDGE_THRESHOLDS.gravityEarth;
      const enteredTriggerRange =
        accMagG >= EDGE_THRESHOLDS.accTriggerG &&
        newSample.gyroMagnitude >= EDGE_THRESHOLDS.gyroTriggerRadS;

      if (enteredTriggerRange && !inTriggerRangeRef.current) {
        appendMonitoringLog(
          `Sensor entered fall range: acc=${accMagG.toFixed(2)}g, gyro=${newSample.gyroMagnitude.toFixed(2)}rad/s`
        );
      }
      inTriggerRangeRef.current = enteredTriggerRange;

      if (decision.shouldEscalateCandidate) {
        appendMonitoringLog(`Edge filter CALL_API triggered: ${decision.reason}`);
        void processMLDetection('Edge filter detected a potential fall');
      }
    },
    [appendMonitoringLog, processMLDetection]
  );

  useEffect(() => {
    resetEdgeFilter();
    sensorWindowStore.clear();
    inTriggerRangeRef.current = false;
    setMonitoringLogs([]);
    appendMonitoringLog(`API base resolved to ${apiBaseUrl}`);

    services.sensorAdapter.start(handleSensorSample);

    const { state } = getFallEvent();
    if (state === 'IDLE') {
      transitionFallEvent('MONITORING', 'Monitoring screen activated');
    }

    return () => {
      services.sensorAdapter.stop();
    };
  }, [appendMonitoringLog, apiBaseUrl, handleSensorSample]);

  const handleSimulateCandidate = (): void => {
    const { state } = getFallEvent();

    if (
      state !== 'IDLE' &&
      state !== 'MONITORING' &&
      state !== 'CANDIDATE' &&
      state !== 'CONFIRMING'
    ) {
      resetFallEvent();
      transitionFallEvent('MONITORING', 'Reset stale flow before simulation');
    }

    if (state === 'IDLE') {
      transitionFallEvent('MONITORING', 'Monitoring screen activated');
    }

    if (getFallEvent().state === 'MONITORING') {
      transitionFallEvent('CANDIDATE', 'Manual fall candidate simulation');
    }

    if (getFallEvent().state === 'CANDIDATE') {
      transitionFallEvent('CONFIRMING', 'Move to confirmation stage');
    }

    setMLDetectionResult({
      result: 'REAL_FALL',
      fallProbability: 0.85,
      falseProbability: 0.15,
      sampleCount: sensorWindowStore.getTargetWindowSize(),
      triggeredAt: new Date().toISOString(),
    });

    router.push('./confirm');
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="title">Monitoring</ThemedText>
          <StatusBadge state={event.state} showDescription={false} />
        </View>

        {/* Active Status Indicator */}
        <Card variant="glass" style={styles.activeCard}>
          <View style={[styles.pulseOuter, { borderColor: successColor }]}>
            <View style={[styles.pulseInner, { backgroundColor: successColor }]} />
          </View>
          <ThemedText type="subtitle">Monitoring Active</ThemedText>
          <ThemedText type="caption">Continuously tracking your safety</ThemedText>
        </Card>

        {/* Sensor Data Cards */}
        <View style={styles.sensorGrid}>
          <InfoCard
            label="Motion Score"
            value={sample ? sample.motionScore.toFixed(2) : '--'}
            variant="accent"
            size="sm"
          />
          <InfoCard
            label="Acceleration"
            value={sample ? `${sample.accelMagnitude.toFixed(1)} m/s²` : '--'}
            variant="default"
            size="sm"
          />
        </View>

        <View style={styles.sensorGrid}>
          <InfoCard
            label="Gyroscope"
            value={sample ? `${sample.gyroMagnitude.toFixed(2)} rad/s` : '--'}
            variant="warning"
            size="sm"
          />
          <InfoCard
            label="Buffer"
            value={`${bufferFill}%`}
            variant="success"
            size="sm"
          />
        </View>

        {/* Edge Filter Status */}
        <Card variant="outlined" padding="md">
          <ThemedText type="label" style={styles.sectionLabel}>Edge Filter</ThemedText>
          <ThemedText type="caption">
            {edgeStatus ? `${edgeStatus.edgeDecision} - ${edgeStatus.reason}` : 'Initializing...'}
          </ThemedText>
          {edgeStatus?.windowStats && (
            <View style={styles.statsRow}>
              <ThemedText type="caption" style={styles.statItem}>
                min: {edgeStatus.windowStats.minAccG.toFixed(2)}g
              </ThemedText>
              <ThemedText type="caption" style={styles.statItem}>
                max: {edgeStatus.windowStats.maxAccG.toFixed(2)}g
              </ThemedText>
              <ThemedText type="caption" style={styles.statItem}>
                gyro: {edgeStatus.windowStats.maxGyro.toFixed(2)}
              </ThemedText>
            </View>
          )}
        </Card>

        {/* API Status */}
        {apiStatus && (
          <Card variant="default" padding="sm" style={styles.apiCard}>
            <ThemedText type="caption" style={{ color: primaryColor }}>
              ML: {apiStatus}
            </ThemedText>
          </Card>
        )}

        {/* Logs Section */}
        <Card variant="outlined" padding="md" style={styles.logsCard}>
          <ThemedText type="label" style={styles.sectionLabel}>Activity Log</ThemedText>
          <View style={styles.logsContainer}>
            {monitoringLogs.length > 0 ? (
              monitoringLogs
                .slice()
                .reverse()
                .slice(0, 10)
                .map((line, idx) => (
                  <ThemedText key={`${line}-${idx}`} type="caption" style={styles.logLine}>
                    {line}
                  </ThemedText>
                ))
            ) : (
              <ThemedText type="caption" style={styles.logLine}>
                No activity yet...
              </ThemedText>
            )}
          </View>
        </Card>

        {/* Simulate Button */}
        <Button
          title="Simulate Fall Detection"
          variant="outline"
          onPress={handleSimulateCandidate}
          style={styles.simulateButton}
        />
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
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  activeCard: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  pulseOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  pulseInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  sensorGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  sectionLabel: {
    marginBottom: Spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  statItem: {
    fontFamily: 'monospace',
  },
  apiCard: {
    borderLeftWidth: 3,
    borderLeftColor: Palette.primary,
  },
  logsCard: {
    maxHeight: 200,
  },
  logsContainer: {
    gap: Spacing.xs,
  },
  logLine: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  simulateButton: {
    marginTop: Spacing.md,
  },
});
