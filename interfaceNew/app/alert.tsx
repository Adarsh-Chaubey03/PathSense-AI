import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { DispatchStatusCard } from "@/src/components/alert/DispatchStatusCard";
import { StatusBadge } from "@/src/components/common/StatusBadge";
import { sendEmergencyAlert } from "@/src/services/api/contacts";
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
  const [hasDispatched, setHasDispatched] = useState(false);
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
    if (hasDispatched) {
      router.push("./result");
      return;
    }

    if (isDispatching) {
      return;
    }

    setIsDispatching(true);
    setDispatchMessage("Sending alert to emergency contacts...");

    try {
      const location = await Promise.race([
        services.locationAdapter.getCurrentLocation(),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 8000);
        }),
      ]);

      const locationText = location
        ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
        : "location unavailable";

      const alertResponse = await sendEmergencyAlert(
        `Possible fall detected at ${locationText}.`,
      );

      if (alertResponse.success) {
        const sentCount = alertResponse.recipients.filter(
          (recipient) => recipient.status === "sent",
        ).length;
        setDispatchMessage(
          location
            ? `SOS sent to ${sentCount}/${alertResponse.recipients.length} contacts with location.`
            : `SOS sent to ${sentCount}/${alertResponse.recipients.length} contacts without location (timeout fallback).`,
        );
      } else {
        setDispatchMessage(alertResponse.message);
      }
    } catch {
      setDispatchMessage(
        "Unable to reach backend. Local emergency flow continues.",
      );
    }

    if (getFallEvent().state === "ALERTING") {
      transitionFallEvent("RESOLVED", "SOS dispatch marked complete");
    }

    setHasDispatched(true);
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
        <ThemedText type="link">
          {isDispatching
            ? "Dispatching..."
            : hasDispatched
              ? "Continue to result"
              : "Mark as dispatched"}
        </ThemedText>
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
