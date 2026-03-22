import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button, Card } from "@/components/ui";
import { BorderRadius, Spacing } from "@/constants/theme";
import { useThemeColor } from "@/hooks/use-theme-color";
import { StatusBadge } from "@/src/components/common/StatusBadge";
import type { SensorSample } from "@/src/services/sensors/sensor-adapter";
import { services } from "@/src/services";
import { sensorWindowStore } from "@/src/services/sensors/sensor-window-store";
import {
  postFallDetectWithRetry,
  getHealth,
  type FallDetectResult,
} from "@/src/services/api/fall-events";
import { getApiBaseUrl } from "@/src/services/api/client";
import {
  getFallEvent,
  resetFallEvent,
  transitionFallEvent,
  setMLDetectionResult,
} from "@/src/state/fall-event-store";
import { useFallEvent } from "@/src/state/use-fall-event";
import {
  evaluateWithEdgeFilter,
  getEdgeFilterThresholds,
  resetEdgeFilter,
  type DetectionDecision,
} from "@/src/features/fall-event/detection";
import {
  buildSafeSignalKeyFromSample,
  isSafeSignalKeyCached,
} from "@/src/services/storage/safe-fall-cache";

const EDGE_THRESHOLDS = getEdgeFilterThresholds();

function isValidFallResult(result: unknown): result is FallDetectResult {
  return (
    result === "REAL_FALL" || result === "FALSE_ALARM" || result === "NO_FALL"
  );
}

function isValidProbability(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

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

  const primaryColor = useThemeColor({}, "primary");
  const successColor = useThemeColor({}, "success");
  const warningColor = useThemeColor({}, "warning");
  const dangerColor = useThemeColor({}, "danger");
  const accentColor = useThemeColor({}, "accent");
  const cardAlt = useThemeColor({}, "cardAlt");
  const borderColor = useThemeColor({}, "borderLight");
  const textSecondary = useThemeColor({}, "textSecondary");

  // Prevent concurrent API calls
  const isProcessingRef = useRef(false);
  const inTriggerRangeRef = useRef(false);

  const appendMonitoringLog = useCallback((message: string): void => {
    const stamp = new Date().toLocaleTimeString();
    const entry = `[${stamp}] ${message}`;
    setMonitoringLogs((prev) => [...prev.slice(-79), entry]);
  }, []);

  // Define routeToConfirmation first (no dependencies on other callbacks)
  const routeToConfirmation = useCallback(
    (reason: string) => {
      const { state } = getFallEvent();

      if (
        state !== "IDLE" &&
        state !== "MONITORING" &&
        state !== "CANDIDATE" &&
        state !== "CONFIRMING"
      ) {
        resetFallEvent();
        transitionFallEvent(
          "MONITORING",
          "Reset stale flow before ML-confirmed fall",
        );
      }

      if (state === "IDLE") {
        transitionFallEvent("MONITORING", "Edge filter activated monitoring");
      }

      if (getFallEvent().state === "MONITORING") {
        transitionFallEvent(
          "CANDIDATE",
          "Edge AI detected potential fall pattern",
        );
      }

      if (getFallEvent().state === "CANDIDATE") {
        transitionFallEvent("CONFIRMING", reason);
      }

      router.push("./confirm");
    },
    [router],
  );

  // storeMLResultAndNavigate depends on routeToConfirmation
  const storeMLResultAndNavigate = useCallback(
    (
      result: FallDetectResult,
      fallProb: number,
      falseProb: number,
      sampleCount: number,
      reason: string,
      safeSignalKey?: string,
    ): void => {
      // Store the ML detection result
      setMLDetectionResult({
        result,
        fallProbability: fallProb,
        falseProbability: falseProb,
        sampleCount,
        triggeredAt: new Date().toISOString(),
        safeSignalKey,
      });

      // Only navigate to confirmation for REAL_FALL
      if (result === "REAL_FALL") {
        appendMonitoringLog(
          "Backend confirmed REAL_FALL -> opening Are you OK page",
        );
        routeToConfirmation(reason);
      } else {
        // For FALSE_ALARM or NO_FALL, reset and continue monitoring
        setApiStatus(`ML determined: ${result} - continuing monitoring`);
        appendMonitoringLog(
          `Backend result ${result} -> staying on monitoring and resetting edge filter`,
        );
        resetEdgeFilter();
      }
    },
    [appendMonitoringLog, routeToConfirmation],
  );

  // processMLDetection depends on storeMLResultAndNavigate
  const processMLDetection = useCallback(
    async (reason: string, triggerSample: SensorSample): Promise<void> => {
      // Prevent concurrent processing
      if (isProcessingRef.current) {
        appendMonitoringLog(
          "ML API call skipped: previous request still in progress",
        );
        return;
      }
      isProcessingRef.current = true;

      try {
        // 1. Extract the 2-second buffer window (safe snapshot)
        const windowPayload = sensorWindowStore.getWindowForApiCall();
        const window = sensorWindowStore.getWindowForML();
        const sampleCount = window.length;
        const bufferedSamples = sensorWindowStore.getSampleCount();
        const targetWindowSize = sensorWindowStore.getTargetWindowSize();

        if (!windowPayload || sampleCount !== targetWindowSize) {
          setApiStatus(
            `Insufficient 2s window: buffered=${bufferedSamples}, normalized=${sampleCount}, need=${targetWindowSize}`,
          );
          appendMonitoringLog(
            `ML API not called: 2s pre-fall window not ready (buffered=${bufferedSamples}, normalized=${sampleCount}/${targetWindowSize})`,
          );
          isProcessingRef.current = false;
          return;
        }

        const safeSignalKey = buildSafeSignalKeyFromSample(triggerSample);
        const shouldSuppressApiCall =
          await isSafeSignalKeyCached(safeSignalKey);
        if (shouldSuppressApiCall) {
          setApiStatus(
            "Safe cache matched - skipping ML API and continuing monitoring",
          );
          appendMonitoringLog(
            `Safe cache hit for signal ${safeSignalKey}; suppressing /fall-detect call`,
          );
          storeMLResultAndNavigate(
            "NO_FALL",
            0,
            0,
            sampleCount,
            reason,
            safeSignalKey,
          );
          return;
        }

        setApiStatus(`Sending ${sampleCount} samples to ML API...`);
        appendMonitoringLog(
          `Trigger API call: window=${sampleCount}x6, duration=${windowPayload.windowEndMs - windowPayload.windowStartMs}ms`,
        );

        // 2. Call the ML backend API
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
          setApiStatus("ML API unavailable - continuing monitoring");
          appendMonitoringLog(
            "ML API call failed after retries; suppressing escalation and continuing monitoring",
          );
          storeMLResultAndNavigate(
            "NO_FALL",
            0,
            0,
            sampleCount,
            reason,
            safeSignalKey,
          );
          return;
        }

        // 3. Store ML result and handle based on response
        const { result, fall_prob, false_prob } = response;

        if (
          !isValidFallResult(result) ||
          !isValidProbability(fall_prob) ||
          !isValidProbability(false_prob)
        ) {
          setApiStatus("Invalid ML API response - continuing monitoring");
          appendMonitoringLog(
            "ML API returned invalid payload; suppressing escalation and continuing monitoring",
          );
          storeMLResultAndNavigate(
            "NO_FALL",
            0,
            0,
            sampleCount,
            reason,
            safeSignalKey,
          );
          return;
        }

        setApiStatus(
          `ML result: ${result} (fall: ${(fall_prob * 100).toFixed(1)}%)`,
        );
        appendMonitoringLog(
          `ML API response: ${result}, fall=${(fall_prob * 100).toFixed(1)}%, false=${(false_prob * 100).toFixed(1)}%`,
        );

        storeMLResultAndNavigate(
          result,
          fall_prob,
          false_prob,
          sampleCount,
          reason,
          safeSignalKey,
        );
      } catch {
        setApiStatus("Error reaching ML API - continuing monitoring");
        appendMonitoringLog(
          "ML API error during processing; suppressing escalation and continuing monitoring",
        );
        storeMLResultAndNavigate("NO_FALL", 0, 0, 0, reason);
      } finally {
        isProcessingRef.current = false;
      }
    },
    [appendMonitoringLog, storeMLResultAndNavigate],
  );

  const handleSensorSample = useCallback(
    (newSample: SensorSample) => {
      setSample(newSample);

      // Update buffer fill indicator
      setBufferFill(sensorWindowStore.getBufferFillPercent());

      // Process sample through edge AI filter
      const decision = evaluateWithEdgeFilter(newSample);
      setEdgeStatus(decision);

      const accMagG = newSample.accelMagnitude / EDGE_THRESHOLDS.gravityEarth;
      const enteredTriggerRange =
        accMagG >= EDGE_THRESHOLDS.accTriggerG &&
        newSample.gyroMagnitude >= EDGE_THRESHOLDS.gyroTriggerRadS;

      if (enteredTriggerRange && !inTriggerRangeRef.current) {
        appendMonitoringLog(
          `Sensor entered fall range: acc=${accMagG.toFixed(2)}g, gyro=${newSample.gyroMagnitude.toFixed(2)}rad/s`,
        );
      }
      inTriggerRangeRef.current = enteredTriggerRange;

      // Edge-filter responsibility: when spike detected, extract buffer and call ML API
      if (decision.shouldEscalateCandidate) {
        appendMonitoringLog(
          `Edge filter CALL_API triggered: ${decision.reason}`,
        );
        void processMLDetection(
          "Edge filter detected a potential fall",
          newSample,
        );
      }
    },
    [appendMonitoringLog, processMLDetection],
  );

  useEffect(() => {
    // Reset edge filter and clear buffer when monitoring starts
    resetEdgeFilter();
    sensorWindowStore.clear();
    inTriggerRangeRef.current = false;
    setMonitoringLogs([]);
    appendMonitoringLog(`API base resolved to ${apiBaseUrl}`);

    void (async () => {
      try {
        const health = await getHealth();
        appendMonitoringLog(
          `Backend health check OK: ${health.status} @ ${health.timestamp}`,
        );
      } catch {
        appendMonitoringLog(
          "Backend health check FAILED: verify API base URL/device network/server status",
        );
      }
    })();

    // Start sensor monitoring
    services.sensorAdapter.start(handleSensorSample);

    // Ensure we're in MONITORING state
    const { state } = getFallEvent();
    if (state === "IDLE") {
      transitionFallEvent("MONITORING", "Monitoring screen activated");
    }

    return () => {
      services.sensorAdapter.stop();
    };
  }, [appendMonitoringLog, apiBaseUrl, handleSensorSample]);

  const handleSimulateCandidate = (): void => {
    const { state } = getFallEvent();

    if (
      state !== "IDLE" &&
      state !== "MONITORING" &&
      state !== "CANDIDATE" &&
      state !== "CONFIRMING"
    ) {
      resetFallEvent();
      transitionFallEvent("MONITORING", "Reset stale flow before simulation");
    }

    if (state === "IDLE") {
      transitionFallEvent("MONITORING", "Monitoring screen activated");
    }

    if (getFallEvent().state === "MONITORING") {
      transitionFallEvent("CANDIDATE", "Manual fall candidate simulation");
    }

    if (getFallEvent().state === "CANDIDATE") {
      transitionFallEvent("CONFIRMING", "Move to confirmation stage");
    }

    // Store mock ML result for simulation
    setMLDetectionResult({
      result: "REAL_FALL",
      fallProbability: 0.85,
      falseProbability: 0.15,
      sampleCount: sensorWindowStore.getTargetWindowSize(),
      triggeredAt: new Date().toISOString(),
    });

    router.push("./confirm");
  };

  const isApiHealthy = apiStatus && !apiStatus.toLowerCase().includes("error");

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
            Live Monitoring
          </ThemedText>
          <ThemedText type="caption" style={styles.subtitle}>
            PathSense continuously analyzes motion and confirms high-risk
            events.
          </ThemedText>
          <StatusBadge state={event.state} />
        </View>

        <Card variant="glass" padding="lg" style={styles.metricsCard}>
          <ThemedText type="label">Motion Telemetry</ThemedText>
          <View style={styles.metricsGrid}>
            <View style={[styles.metricCell, { borderColor }]}>
              <ThemedText type="caption">Motion</ThemedText>
              <ThemedText type="subtitle">
                {sample ? sample.motionScore.toFixed(2) : "--"}
              </ThemedText>
            </View>
            <View style={[styles.metricCell, { borderColor }]}>
              <ThemedText type="caption">Accel</ThemedText>
              <ThemedText type="subtitle">
                {sample ? `${sample.accelMagnitude.toFixed(2)} m/s²` : "--"}
              </ThemedText>
            </View>
            <View style={[styles.metricCell, { borderColor }]}>
              <ThemedText type="caption">Gyro</ThemedText>
              <ThemedText type="subtitle">
                {sample ? `${sample.gyroMagnitude.toFixed(2)} rad/s` : "--"}
              </ThemedText>
            </View>
            <View style={[styles.metricCell, { borderColor }]}>
              <ThemedText type="caption">State</ThemedText>
              <ThemedText type="subtitle">
                {sample ? sample.motionState : "waiting"}
              </ThemedText>
            </View>
          </View>
          <ThemedText style={[styles.apiBaseStatus, { color: textSecondary }]}>
            API Base: {apiBaseUrl}
          </ThemedText>
        </Card>

        <Card variant="default" padding="lg" style={styles.progressCard}>
          <View style={styles.rowBetween}>
            <ThemedText type="label">Buffer Readiness</ThemedText>
            <ThemedText type="defaultSemiBold">{bufferFill}%</ThemedText>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: cardAlt }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${bufferFill}%`,
                  backgroundColor:
                    bufferFill >= 100 ? successColor : primaryColor,
                },
              ]}
            />
          </View>
          <ThemedText type="caption">
            {sensorWindowStore.getSampleCount()} raw samples normalized to{" "}
            {sensorWindowStore.getTargetWindowSize()} model samples
          </ThemedText>
        </Card>

        <Card variant="outlined" padding="md">
          <ThemedText type="label" style={styles.cardTitle}>
            Edge Filter
          </ThemedText>
          <ThemedText style={styles.statusText}>
            {edgeStatus
              ? `${edgeStatus.edgeDecision} • ${edgeStatus.reason}`
              : "Initializing edge model..."}
          </ThemedText>
          {edgeStatus?.windowStats && (
            <ThemedText type="caption" style={styles.windowStats}>
              min {edgeStatus.windowStats.minAccG.toFixed(2)}g • max{" "}
              {edgeStatus.windowStats.maxAccG.toFixed(2)}g • gyro{" "}
              {edgeStatus.windowStats.maxGyro.toFixed(2)} rad/s • samples{" "}
              {edgeStatus.windowStats.sampleCount}
            </ThemedText>
          )}
        </Card>

        <Card variant="outlined" padding="md">
          <ThemedText type="label" style={styles.cardTitle}>
            ML API Status
          </ThemedText>
          <ThemedText
            style={[
              styles.statusText,
              {
                color: apiStatus
                  ? isApiHealthy
                    ? accentColor
                    : dangerColor
                  : warningColor,
              },
            ]}
          >
            {apiStatus ?? "Waiting for edge-filter escalation..."}
          </ThemedText>
        </Card>

        <Card variant="glass" padding="md" style={styles.logsCard}>
          <ThemedText type="label" style={styles.cardTitle}>
            Activity Feed
          </ThemedText>
          {monitoringLogs.length > 0 ? (
            <ScrollView
              style={[styles.logsContainer, { borderColor }]}
              contentContainerStyle={styles.logsContentContainer}
            >
              {monitoringLogs
                .slice()
                .reverse()
                .map((line) => (
                  <ThemedText key={line} style={styles.logLine}>
                    {line}
                  </ThemedText>
                ))}
            </ScrollView>
          ) : (
            <ThemedText type="caption" style={styles.logLine}>
              No log events yet.
            </ThemedText>
          )}
        </Card>

        <Button
          title="Simulate fall candidate"
          variant="outline"
          size="lg"
          fullWidth
          onPress={handleSimulateCandidate}
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
    gap: Spacing.lg,
  },
  header: {
    gap: Spacing.sm,
  },
  title: {
    lineHeight: 42,
  },
  subtitle: {
    maxWidth: 320,
    lineHeight: 20,
  },
  metricsCard: {
    gap: Spacing.md,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  metricCell: {
    flexGrow: 1,
    minWidth: 130,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  apiBaseStatus: {
    lineHeight: 18,
    fontSize: 11,
    fontFamily: "monospace",
  },
  progressCard: {
    gap: Spacing.sm,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  progressTrack: {
    width: "100%",
    height: 10,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: BorderRadius.full,
  },
  cardTitle: {
    marginBottom: Spacing.xs,
  },
  statusText: {
    lineHeight: 20,
  },
  windowStats: {
    marginTop: Spacing.sm,
    lineHeight: 18,
    fontFamily: "monospace",
  },
  logsContainer: {
    maxHeight: 220,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  logsContentContainer: {
    gap: Spacing.xs,
  },
  logLine: {
    lineHeight: 16,
    fontSize: 11,
    opacity: 0.85,
    fontFamily: "monospace",
  },
  logsCard: {
    gap: Spacing.sm,
  },
});
