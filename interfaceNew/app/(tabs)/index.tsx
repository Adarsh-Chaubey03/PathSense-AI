import { useRouter } from "expo-router";
import { StyleSheet, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Card, Button } from "@/components/ui";
import { StatusBadge } from "@/src/components/common/StatusBadge";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Spacing, BorderRadius, Palette } from "@/constants/theme";
import {
  getFallEvent,
  transitionFallEvent,
} from "@/src/state/fall-event-store";

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const primaryLight = useThemeColor({}, "primaryLight");
  const accentLight = useThemeColor({}, "accentLight");

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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="hero" style={styles.title}>
            PathSense
          </ThemedText>
          <ThemedText type="caption" style={styles.subtitle}>
            Your personal safety companion
          </ThemedText>
        </View>

        {/* Status Card */}
        <Card variant="elevated" style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <ThemedText type="label">Current Status</ThemedText>
          </View>
          <StatusBadge state={getFallEvent().state} />
        </Card>

        {/* Main Action Card */}
        <Card
          variant="glass"
          style={[styles.actionCard, { borderColor: primaryLight }]}
        >
          <View style={[styles.actionIcon, { backgroundColor: primaryLight }]}>
            <ThemedText style={styles.iconText}>{">"}</ThemedText>
          </View>
          <ThemedText type="subtitle" style={styles.actionTitle}>
            Start Monitoring
          </ThemedText>
          <ThemedText type="caption" style={styles.actionDescription}>
            Begin fall detection monitoring. We&apos;ll track your movement and
            alert your emergency contacts if a fall is detected.
          </ThemedText>
          <Button
            title="Start Monitoring"
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleStartMonitoring}
            style={styles.actionButton}
          />
        </Card>

        {/* Info Cards Grid */}
        <View style={styles.infoGrid}>
          <Card variant="default" padding="md" style={styles.infoCard}>
            <View style={[styles.infoIcon, { backgroundColor: accentLight }]}>
              <ThemedText style={styles.infoIconText}>ML</ThemedText>
            </View>
            <ThemedText type="defaultSemiBold" style={styles.infoTitle}>
              AI-Powered
            </ThemedText>
            <ThemedText type="caption" style={styles.infoText}>
              Advanced ML detection
            </ThemedText>
          </Card>

          <Card variant="default" padding="md" style={styles.infoCard}>
            <View style={[styles.infoIcon, { backgroundColor: primaryLight }]}>
              <ThemedText style={styles.infoIconText}>24/7</ThemedText>
            </View>
            <ThemedText type="defaultSemiBold" style={styles.infoTitle}>
              Always On
            </ThemedText>
            <ThemedText type="caption" style={styles.infoText}>
              Continuous protection
            </ThemedText>
          </Card>
        </View>

        {/* Settings Link */}
        <Button
          title="Open Settings"
          variant="ghost"
          onPress={handleOpenSettings}
          style={styles.settingsButton}
        />
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
    paddingVertical: Spacing.xl,
  },
  title: {
    textAlign: "center",
  },
  subtitle: {
    marginTop: Spacing.xs,
    textAlign: "center",
  },
  statusCard: {
    gap: Spacing.md,
  },
  statusHeader: {
    marginBottom: Spacing.xs,
  },
  actionCard: {
    alignItems: "center",
    borderWidth: 1,
    gap: Spacing.md,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  iconText: {
    fontSize: 24,
    fontWeight: "700",
    color: Palette.white,
  },
  actionTitle: {
    textAlign: "center",
  },
  actionDescription: {
    textAlign: "center",
    paddingHorizontal: Spacing.md,
  },
  actionButton: {
    marginTop: Spacing.md,
  },
  infoGrid: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  infoCard: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.sm,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  infoIconText: {
    fontSize: 12,
    fontWeight: "700",
    color: Palette.charcoal,
  },
  infoTitle: {
    textAlign: "center",
  },
  infoText: {
    textAlign: "center",
  },
  settingsButton: {
    marginTop: Spacing.sm,
  },
});
