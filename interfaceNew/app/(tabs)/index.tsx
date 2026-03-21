import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { StatusBadge } from "@/src/components/common/StatusBadge";
import {
  getFallEvent,
  transitionFallEvent,
} from "@/src/state/fall-event-store";

export default function HomeScreen() {
  const router = useRouter();

  const handleStartMonitoring = (): void => {
    if (getFallEvent().state === "IDLE") {
      transitionFallEvent("MONITORING", "Monitoring started from home");
    }

    router.push("/monitoring");
  };

  const handleOpenSettings = (): void => {
    router.push("/settings");
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">PathSense Flow</ThemedText>
      <ThemedText style={styles.body}>
        Start monitoring and walk through the fall-response flow.
      </ThemedText>

      <StatusBadge state={getFallEvent().state} />
      <TouchableOpacity onPress={handleStartMonitoring} style={styles.link}>
        <ThemedText type="link">Start monitoring</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleOpenSettings} style={styles.link}>
        <ThemedText type="link">Open settings</ThemedText>
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
