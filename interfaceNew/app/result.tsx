import { useRouter } from "expo-router";
import { StyleSheet, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Card, Button } from "@/components/ui";
import { StatusBadge } from "@/src/components/common/StatusBadge";
import { useThemeColor } from "@/hooks/use-theme-color";
import { BorderRadius, Spacing, Palette } from "@/constants/theme";
import {
  getFallEventTransitions,
  getFallEvent,
  transitionFallEvent,
} from "@/src/state/fall-event-store";
import { useFallEvent } from "@/src/state/use-fall-event";

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const event = useFallEvent();

  const successColor = useThemeColor({}, "success");
  const successLight = useThemeColor({}, "successLight");
  const accentColor = useThemeColor({}, "accent");
  const accentLight = useThemeColor({}, "accentLight");
  const borderColor = useThemeColor({}, "borderLight");
  const textSecondary = useThemeColor({}, "textSecondary");

  const isFalseAlarm = event.state === "FALSE_ALARM";
  const iconColor = isFalseAlarm ? accentColor : successColor;
  const iconBgColor = isFalseAlarm ? accentLight : successLight;

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

  const transitions = getFallEventTransitions();

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
        {/* Success Header */}
        <View style={styles.header}>
          <View style={[styles.iconOuter, { backgroundColor: iconBgColor }]}>
            <View style={[styles.iconInner, { backgroundColor: iconColor }]}>
              <ThemedText style={styles.checkIcon}>
                {isFalseAlarm ? "~" : "✓"}
              </ThemedText>
            </View>
          </View>
          <ThemedText type="hero" style={styles.title}>
            {isFalseAlarm ? "All Clear" : "Event Complete"}
          </ThemedText>
          <ThemedText type="caption" style={styles.subtitle}>
            {isFalseAlarm
              ? "Clear confirmation recorded. Monitoring returns to standby."
              : "Dispatch completed. Emergency contacts were notified."}
          </ThemedText>
          <StatusBadge state={event.state} />
        </View>

        {/* Event Summary Card */}
        <Card variant="default" padding="lg">
          <ThemedText type="label" style={styles.cardLabel}>
            Event Ledger
          </ThemedText>
          <View style={[styles.summaryRow, { borderBottomColor: borderColor }]}> 
            <ThemedText type="caption">Status</ThemedText>
            <ThemedText type="defaultSemiBold">
              {isFalseAlarm ? "Dismissed" : "Resolved"}
            </ThemedText>
          </View>
          <View style={[styles.summaryRow, { borderBottomColor: borderColor }]}> 
            <ThemedText type="caption">Transitions Logged</ThemedText>
            <ThemedText type="defaultSemiBold">{transitions.length}</ThemedText>
          </View>
          <View style={styles.summaryRow}>
            <ThemedText type="caption">Response</ThemedText>
            <ThemedText type="defaultSemiBold">
              {isFalseAlarm ? "User Confirmed Safe" : "Alert Dispatched"}
            </ThemedText>
          </View>
        </Card>

        {/* Transition Log (collapsed) */}
        <Card variant="outlined" padding="md">
          <ThemedText type="label" style={styles.cardLabel}>
            Timeline Extract
          </ThemedText>
          <View style={[styles.logContainer, { borderColor }]}> 
            {transitions
              .slice(-5)
              .reverse()
              .map((t, idx) => (
                <ThemedText
                  key={`${t.timestamp}-${idx}`}
                  type="caption"
                  style={styles.logItem}
                >
                  {t.to} // {t.reason}
                </ThemedText>
              ))}
          </View>
        </Card>

        {/* Action Button */}
        <View style={styles.buttonsContainer}>
          <Button
            title="Back to Monitoring"
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleBackToMonitoring}
          />
        </View>

        {/* Info Text */}
        <ThemedText
          type="caption"
          style={[styles.infoText, { color: textSecondary }]}
        >
          PathSense will continue monitoring your safety. Stay safe!
        </ThemedText>
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
  iconOuter: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(244, 240, 232, 0.25)",
  },
  iconInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: "center",
    justifyContent: "center",
  },
  checkIcon: {
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
  cardLabel: {
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  logContainer: {
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  logItem: {
    fontFamily: "monospace",
    lineHeight: 17,
    fontSize: 11,
    opacity: 0.88,
  },
  buttonsContainer: {
    paddingTop: Spacing.md,
  },
  infoText: {
    textAlign: "center",
    opacity: 0.7,
    paddingHorizontal: Spacing.lg,
  },
});
