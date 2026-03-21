import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StatusBadge } from "@/src/components/common/StatusBadge";
import {
  getFallEventTransitions,
  getFallEvent,
  transitionFallEvent,
} from "@/src/state/fall-event-store";
import { useFallEvent } from "@/src/state/use-fall-event";

export default function ResultScreen() {
  const router = useRouter();
  const event = useFallEvent();

  const handleBackToMonitoring = (): void => {
    const { state } = getFallEvent();

    if (state === "RESOLVED") {
      transitionFallEvent("IDLE", "Resolved event closed");
    }

    if (getFallEvent().state === "FALSE_ALARM") {
      transitionFallEvent("MONITORING", "Resume monitoring after false alarm");
    } else if (getFallEvent().state === "IDLE") {
      transitionFallEvent("MONITORING", "Resume monitoring after resolution");
    }

    router.push("./monitoring");
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Event Result</ThemedText>
      <ThemedText style={styles.body}>
        Event completed. Ready to return to monitoring.
      </ThemedText>
      <StatusBadge state={event.state} />
      <ThemedText style={styles.body}>
        Logged transitions: {getFallEventTransitions().length}
      </ThemedText>
      <TouchableOpacity onPress={handleBackToMonitoring} style={styles.link}>
        <ThemedText type="link">Back to monitoring</ThemedText>
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
    marginTop: 8,
  },
});
