import { useEffect, useState } from "react";
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

export default function MonitoringScreen() {
  const router = useRouter();
  const event = useFallEvent();
  const [sample, setSample] = useState<SensorSample | null>(null);

  useEffect(() => {
    services.sensorAdapter.start(setSample);

    return () => {
      services.sensorAdapter.stop();
    };
  }, []);

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
  link: {
    marginTop: 12,
  },
});
