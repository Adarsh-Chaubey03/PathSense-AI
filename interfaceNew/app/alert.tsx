import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { DispatchStatusCard } from "@/src/components/alert/DispatchStatusCard";
import { StatusBadge } from "@/src/components/common/StatusBadge";
import { sendContactAlert } from "@/src/services/api/fall-events";
import { playEmergencyHaptic } from "@/src/services/feedback/haptics";
import { speakEmergencyPrompt } from "@/src/services/feedback/voice";
import { services } from "@/src/services";
import {
  getFallEvent,
  resetFallEvent,
  transitionFallEvent,
} from "@/src/state/fall-event-store";
import { useFallEvent } from "@/src/state/use-fall-event";

export default function AlertScreen() {
  const router = useRouter();
  const event = useFallEvent();
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState(
    "Preparing SOS payload and notifying contacts.",
  );

  useEffect(() => {
    if (getFallEvent().state === "IDLE") {
      transitionFallEvent("MONITORING", "Monitoring inferred at alert entry");
      transitionFallEvent("CANDIDATE", "Candidate inferred at alert entry");
      transitionFallEvent("CONFIRMING", "Confirming inferred at alert entry");
    }

    if (getFallEvent().state === "CONFIRMING") {
      transitionFallEvent("ALERTING", "Alert screen opened from confirmation");
    }

    if (getFallEvent().state !== "ALERTING") {
      resetFallEvent();
      transitionFallEvent("MONITORING", "Recovered alert flow state");
      transitionFallEvent("CANDIDATE", "Recovered candidate state");
      transitionFallEvent("CONFIRMING", "Recovered confirming state");
      transitionFallEvent("ALERTING", "Recovered alert state");
    }

    void playEmergencyHaptic();
    void speakEmergencyPrompt();
  }, []);

  const handleDispatched = async (): Promise<void> => {
    if (isDispatching) {
      return;
    }

    setIsDispatching(true);

    try {
      const location = await services.locationAdapter.getCurrentLocation();
      await sendContactAlert(
        `Possible fall detected at ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}.`,
      );
      setDispatchMessage("SOS payload dispatched to emergency contacts.");
    } catch {
      setDispatchMessage(
        "Unable to reach backend. Local emergency flow continues.",
      );
    }

    if (getFallEvent().state === "ALERTING") {
      transitionFallEvent("RESOLVED", "SOS dispatch marked complete");
    }

    router.push("./result");
    setIsDispatching(false);
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Alert Dispatch</ThemedText>
      <DispatchStatusCard message={dispatchMessage} />
      <StatusBadge state={event.state} />
      <TouchableOpacity
        onPress={() => void handleDispatched()}
        style={styles.link}
        disabled={isDispatching}
      >
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
