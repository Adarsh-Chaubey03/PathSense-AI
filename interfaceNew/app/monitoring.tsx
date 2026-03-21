import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StatusBadge } from "@/src/components/common/StatusBadge";
import type { SensorSample } from "@/src/services/sensors/sensor-adapter";
import { services } from "@/src/services";
import {
  getFallEvent,
  resetFallEvent,
  transitionFallEvent,
} from "@/src/state/fall-event-store";
import { useFallEvent } from "@/src/state/use-fall-event";
import {
  evaluateWithEdgeFilter,
  resetEdgeFilter,
  type DetectionDecision,
} from "@/src/features/fall-event/detection";
import { postFallDetectWithRetry } from "@/src/services/api/fall-events";
import type { RawSensorDataPoint } from "@/src/services/sensors/sensor-window-store";

function buildInferenceWindow(samples: RawSensorDataPoint[]): number[][] | null {
  if (!Array.isArray(samples) || samples.length === 0) {
    return null;
  }

  const selected = samples.length >= 100 ? samples.slice(-100) : [...samples];

  if (selected.length < 100) {
    const first = selected[0];
    const missing = 100 - selected.length;
    for (let i = 0; i < missing; i += 1) {
      selected.unshift(first);
    }
  }

  return selected.map((sample) => [
    sample.acc_x,
    sample.acc_y,
    sample.acc_z,
    sample.gyro_x,
    sample.gyro_y,
    sample.gyro_z,
  ]);
}

export default function MonitoringScreen() {
  const router = useRouter();
  const event = useFallEvent();
  const [sample, setSample] = useState<SensorSample | null>(null);
  const [edgeStatus, setEdgeStatus] = useState<DetectionDecision | null>(null);
  const mlRequestInFlight = useRef(false);

  const handleSensorSample = useCallback(
    (newSample: SensorSample) => {
      setSample(newSample);

      // Process sample through edge AI filter
      const decision = evaluateWithEdgeFilter(newSample);
      setEdgeStatus(decision);

      // If edge filter decides to call API, transition to confirmation flow
      if (decision.shouldEscalateCandidate && !mlRequestInFlight.current) {
        const window = buildInferenceWindow(decision.sensorData ?? []);
        if (!window) {
          return;
        }

        mlRequestInFlight.current = true;

        void postFallDetectWithRetry(window)
          .then((mlResult) => {
            if (!mlResult || mlResult.result !== "REAL_FALL") {
              return;
            }

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
              transitionFallEvent("CANDIDATE", "Edge AI detected potential fall pattern");
            }

            if (getFallEvent().state === "CANDIDATE") {
              transitionFallEvent("CONFIRMING", "Backend ML confirmed real fall");
            }

            router.push("./confirm");
          })
          .finally(() => {
            mlRequestInFlight.current = false;
          });
      }
    },
    [router],
  );

  useEffect(() => {
    // Reset edge filter when monitoring starts
    resetEdgeFilter();

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
      <ThemedText style={styles.edgeStatus}>
        Edge filter:{" "}
        {edgeStatus
          ? `${edgeStatus.edgeDecision} - ${edgeStatus.reason}`
          : "initializing..."}
      </ThemedText>
      {edgeStatus?.windowStats && (
        <ThemedText style={styles.windowStats}>
          Window: min={edgeStatus.windowStats.minAccG.toFixed(2)}g |
          max={edgeStatus.windowStats.maxAccG.toFixed(2)}g |
          gyro={edgeStatus.windowStats.maxGyro.toFixed(2)} rad/s |
          samples={edgeStatus.windowStats.sampleCount}
        </ThemedText>
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
  link: {
    marginTop: 12,
  },
});
