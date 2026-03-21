import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import {
  getFallEvent,
  transitionFallEvent,
} from "@/src/state/fall-event-store";

export default function MonitoringScreen() {
  const router = useRouter();

  const handleSimulateCandidate = (): void => {
    const { state } = getFallEvent();

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
      <ThemedText style={styles.body}>State: {getFallEvent().state}</ThemedText>
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
