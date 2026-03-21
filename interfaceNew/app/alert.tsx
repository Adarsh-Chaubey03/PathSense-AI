import { useEffect } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { getFallEvent, transitionFallEvent } from "@/src/state/fall-event-store";

export default function AlertScreen() {
  const router = useRouter();

  useEffect(() => {
    if (getFallEvent().state === "CONFIRMING") {
      transitionFallEvent("ALERTING", "Alert screen opened from confirmation");
    }
  }, []);

  const handleDispatched = (): void => {
    if (getFallEvent().state === "ALERTING") {
      transitionFallEvent("RESOLVED", "SOS dispatch marked complete");
    }

    router.push("./result");
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Alert Dispatch</ThemedText>
      <ThemedText style={styles.body}>
        Preparing SOS payload and notifying contacts.
      </ThemedText>
      <ThemedText style={styles.body}>State: {getFallEvent().state}</ThemedText>
      <TouchableOpacity onPress={handleDispatched} style={styles.link}>
        <ThemedText type="link">Mark as dispatched</ThemedText>
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
