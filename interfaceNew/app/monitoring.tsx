import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StatusBadge } from "@/src/components/common/StatusBadge";
import type { SensorSample } from "@/src/services/sensors/sensor-adapter";
import { services } from "@/src/services";
import { sensorWindowStore } from "@/src/services/sensors/sensor-window-store";
import {
  postFallDetectWithRetry,
  type FallDetectResult,
} from "@/src/services/api/fall-events";
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

const EDGE_THRESHOLDS = getEdgeFilterThresholds();

export default function MonitoringScreen() {
  const router = useRouter();
  const event = useFallEvent();
  const [sample, setSample] = useState<SensorSample | null>(null);
  const [edgeStatus, setEdgeStatus] = useState<DetectionDecision | null>(null);
  const [bufferFill, setBufferFill] = useState(0);
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [monitoringLogs, setMonitoringLogs] = useState<string[]>([]);

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
    ): void => {
      // Store the ML detection result
      setMLDetectionResult({
        result,
        fallProbability: fallProb,
        falseProbability: falseProb,
        sampleCount,
        triggeredAt: new Date().toISOString(),
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
    async (reason: string): Promise<void> => {
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
          setApiStatus("ML API failed - treating as potential fall");
          appendMonitoringLog(
            "ML API call failed; fallback REAL_FALL flow applied",
          );
          // On API failure, default to showing confirmation (safety first)
          storeMLResultAndNavigate("REAL_FALL", 0.5, 0.5, sampleCount, reason);
          return;
        }

        // 3. Store ML result and handle based on response
        const { result, fall_prob, false_prob } = response;
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
        );
      } catch {
        setApiStatus("Error processing fall detection");
        appendMonitoringLog(
          "ML API error during processing; fallback REAL_FALL flow applied",
        );
        // On error, default to showing confirmation (safety first)
        storeMLResultAndNavigate("REAL_FALL", 0.5, 0.5, 0, reason);
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
        void processMLDetection("Edge filter detected a potential fall");
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
  }, [handleSensorSample]);

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

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Monitoring</ThemedText>
      <ThemedText style={styles.body}>
        Continuous monitoring is active.
      </ThemedText>
      <StatusBadge state={event.state} />
      <ThemedText style={styles.body}>
        Sensor sample:{" "}
        {sample
          ? `motion ${sample.motionScore.toFixed(2)} | accel ${sample.accelMagnitude.toFixed(2)} m/s² | gyro ${sample.gyroMagnitude.toFixed(2)} rad/s | ${sample.motionState}`
          : "waiting..."}
      </ThemedText>
      <ThemedText style={styles.bufferStatus}>
        Buffer: {bufferFill}% ({sensorWindowStore.getSampleCount()} raw →{" "}
        {sensorWindowStore.getTargetWindowSize()} model samples)
      </ThemedText>
      <ThemedText style={styles.edgeStatus}>
        Edge filter:{" "}
        {edgeStatus
          ? `${edgeStatus.edgeDecision} - ${edgeStatus.reason}`
          : "initializing..."}
      </ThemedText>
      {edgeStatus?.windowStats && (
        <ThemedText style={styles.windowStats}>
          Window: min={edgeStatus.windowStats.minAccG.toFixed(2)}g | max=
          {edgeStatus.windowStats.maxAccG.toFixed(2)}g | gyro=
          {edgeStatus.windowStats.maxGyro.toFixed(2)} rad/s | samples=
          {edgeStatus.windowStats.sampleCount}
        </ThemedText>
      )}
      {apiStatus && (
        <ThemedText style={styles.apiStatus}>ML API: {apiStatus}</ThemedText>
      )}
      <ThemedText style={styles.logsTitle}>Monitoring logs</ThemedText>
      {monitoringLogs.length > 0 ? (
        <ScrollView
          style={styles.logsContainer}
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
        <ThemedText style={styles.logLine}>No log events yet.</ThemedText>
      )}
      <TouchableOpacity onPress={handleSimulateCandidate} style={styles.link}>
        <ThemedText type="link">Simulate fall candidate</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    gap: 12,
  },
  body: {
    lineHeight: 22,
  },
  bufferStatus: {
    lineHeight: 20,
    fontSize: 12,
    opacity: 0.9,
    color: "#4CAF50",
  },
  edgeStatus: {
    lineHeight: 20,
    fontSize: 12,
    opacity: 0.8,
  },
  windowStats: {
    lineHeight: 18,
    fontSize: 11,
    opacity: 0.6,
    fontFamily: "monospace",
  },
  apiStatus: {
    lineHeight: 20,
    fontSize: 12,
    opacity: 0.9,
    color: "#2196F3",
  },
  logsTitle: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.9,
    fontWeight: "600",
  },
  logsContainer: {
    maxHeight: 220,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  logsContentContainer: {
    gap: 4,
  },
  logLine: {
    lineHeight: 16,
    fontSize: 11,
    opacity: 0.85,
    fontFamily: "monospace",
  },
  link: {
    marginTop: 12,
  },
});
