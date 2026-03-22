import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Card, Button } from "@/components/ui";
import { DispatchStatusCard } from "@/src/components/alert/DispatchStatusCard";
import { StatusBadge } from "@/src/components/common/StatusBadge";
import { useThemeColor } from "@/hooks/use-theme-color";
import { BorderRadius, Spacing, Palette } from "@/constants/theme";
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
  const insets = useSafeAreaInsets();
  const event = useFallEvent();
  const [isDispatching, setIsDispatching] = useState(false);
  const [hasDispatched, setHasDispatched] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState(
    "Preparing SOS payload and notifying contacts.",
  );

  const dangerColor = useThemeColor({}, "danger");
  const dangerLight = useThemeColor({}, "dangerLight");
  const cardAlt = useThemeColor({}, "cardAlt");
  const borderColor = useThemeColor({}, "borderLight");
  const textSecondary = useThemeColor({}, "textSecondary");

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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Emergency Header */}
        <View style={styles.header}>
          <View
            style={[styles.alertIconOuter, { backgroundColor: dangerLight }]}
          >
            <View
              style={[styles.alertIconInner, { backgroundColor: dangerColor }]}
            >
              <ThemedText style={styles.alertIcon}>!</ThemedText>
            </View>
          </View>
          <ThemedText
            type="hero"
            style={[styles.title, { color: dangerColor }]}
          >
            Emergency Alert
          </ThemedText>
          <ThemedText type="caption" style={styles.subtitle}>
            Critical escalation is active. Dispatch control is armed.
          </ThemedText>
          <StatusBadge state={event.state} />
        </View>

        {/* Dispatch Status Card */}
        <DispatchStatusCard
          message={dispatchMessage}
          isLoading={isDispatching}
          success={hasDispatched}
        />

        {/* Location Info */}
        <Card variant="outlined" padding="md">
          <ThemedText type="label" style={styles.sectionLabel}>
            Tactical Feed
          </ThemedText>
          <View style={[styles.infoRow, { borderBottomColor: borderColor }]}>
            <ThemedText type="caption">GPS</ThemedText>
            <ThemedText type="defaultSemiBold" style={styles.infoValue}>
              {isDispatching
                ? "Acquiring coordinates"
                : hasDispatched
                  ? "Attached to dispatch"
                  : "Standby"}
            </ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText type="caption">Emergency Contacts</ThemedText>
            <ThemedText type="defaultSemiBold" style={styles.infoValue}>
              {hasDispatched ? "Notified" : "Pending"}
            </ThemedText>
          </View>
        </Card>

        {/* Action Button */}
        <View style={styles.buttonsContainer}>
          <Button
            title={
              isDispatching
                ? "Dispatching..."
                : hasDispatched
                  ? "Continue"
                  : "Send Emergency Alert"
            }
            variant={hasDispatched ? "primary" : "danger"}
            size="lg"
            fullWidth
            onPress={() => void handleDispatched()}
            disabled={isDispatching}
            loading={isDispatching}
          />
        </View>

        {/* Info Text */}
        <Card
          variant="glass"
          padding="md"
          style={[styles.noticeCard, { backgroundColor: cardAlt }]}
        >
          <ThemedText
            type="caption"
            style={[styles.infoText, { color: textSecondary }]}
          >
            {hasDispatched
              ? "Emergency sequence complete. Contacts have been notified."
              : "Send the alert to notify all configured emergency contacts."}
          </ThemedText>
        </Card>
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
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  alertIconOuter: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(244, 240, 232, 0.25)",
  },
  alertIconInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
  },
  alertIcon: {
    fontSize: 32,
    fontWeight: "700",
    color: Palette.white,
  },
  title: {
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    maxWidth: 340,
    lineHeight: 20,
  },
  sectionLabel: {
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  infoValue: {
    textAlign: "right",
  },
  buttonsContainer: {
    paddingTop: Spacing.md,
  },
  noticeCard: {
    borderRadius: BorderRadius.md,
  },
  infoText: {
    textAlign: "center",
    lineHeight: 20,
    opacity: 0.85,
  },
});
