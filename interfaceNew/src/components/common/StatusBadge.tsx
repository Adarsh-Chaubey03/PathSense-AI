/**
 * StatusBadge - Visual indicator for fall event state.
 * Soft, pill-shaped badge with color-coded status.
 */

import { StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { BorderRadius, Spacing, Palette } from "@/constants/theme";
import type { FallEventState } from "@/src/features/fall-event/event.types";

interface StatusBadgeProps {
  state: FallEventState;
  showDescription?: boolean;
}

const STATE_CONFIG: Record<
  FallEventState,
  {
    label: string;
    description: string;
    colorKey:
      | "primary"
      | "secondary"
      | "success"
      | "warning"
      | "danger"
      | "accent";
    lightKey:
      | "primaryLight"
      | "successLight"
      | "warningLight"
      | "dangerLight"
      | "accentLight";
  }
> = {
  IDLE: {
    label: "IDLE",
    description: "Monitoring paused",
    colorKey: "secondary",
    lightKey: "primaryLight",
  },
  MONITORING: {
    label: "ACTIVE",
    description: "Realtime safety monitoring",
    colorKey: "primary",
    lightKey: "successLight",
  },
  CANDIDATE: {
    label: "ANALYZING",
    description: "Evaluating motion spike",
    colorKey: "warning",
    lightKey: "warningLight",
  },
  CONFIRMING: {
    label: "CONFIRM",
    description: "Awaiting user response",
    colorKey: "warning",
    lightKey: "warningLight",
  },
  ALERTING: {
    label: "ALERT",
    description: "Dispatch in progress",
    colorKey: "accent",
    lightKey: "dangerLight",
  },
  ESCALATING: {
    label: "ESCALATING",
    description: "Notifying emergency contacts",
    colorKey: "danger",
    lightKey: "dangerLight",
  },
  RESOLVED: {
    label: "RESOLVED",
    description: "Incident flow completed",
    colorKey: "secondary",
    lightKey: "successLight",
  },
  FALSE_ALARM: {
    label: "CLEAR",
    description: "False alarm acknowledged",
    colorKey: "success",
    lightKey: "accentLight",
  },
};

export function StatusBadge({
  state,
  showDescription = true,
}: StatusBadgeProps) {
  const config = STATE_CONFIG[state];

  const primary = useThemeColor({}, "primary");
  const secondary = useThemeColor({}, "secondary");
  const success = useThemeColor({}, "success");
  const warning = useThemeColor({}, "warning");
  const danger = useThemeColor({}, "danger");
  const accent = useThemeColor({}, "accent");
  const primaryLight = useThemeColor({}, "primaryLight");
  const successLight = useThemeColor({}, "successLight");
  const warningLight = useThemeColor({}, "warningLight");
  const dangerLight = useThemeColor({}, "dangerLight");
  const accentLight = useThemeColor({}, "accentLight");
  const textColor = useThemeColor({}, "text");

  const getColor = () => {
    switch (config.colorKey) {
      case "success":
        return success;
      case "secondary":
        return secondary;
      case "warning":
        return warning;
      case "danger":
        return danger;
      case "accent":
        return accent;
      default:
        return primary;
    }
  };

  const color = getColor();

  const getTintColor = () => {
    switch (config.lightKey) {
      case "successLight":
        return successLight;
      case "warningLight":
        return warningLight;
      case "dangerLight":
        return dangerLight;
      case "accentLight":
        return accentLight;
      default:
        return primaryLight;
    }
  };

  const tintColor = getTintColor();

  return (
    <View style={styles.container}>
      <View style={[styles.badgeOuter, { backgroundColor: tintColor }]}>
        <View style={[styles.badge, { backgroundColor: color }]}>
          <View style={styles.dot} />
          <ThemedText style={styles.label}>{config.label}</ThemedText>
        </View>
      </View>
      {showDescription && (
        <ThemedText
          type="caption"
          style={[styles.description, { color: textColor }]}
        >
          {config.description}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: Spacing.xs,
  },
  badgeOuter: {
    borderRadius: BorderRadius.full,
    padding: 2,
  },
  badge: {
    borderRadius: BorderRadius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.white,
  },
  label: {
    color: Palette.white,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.9,
  },
  description: {
    lineHeight: 17,
    opacity: 0.72,
  },
});
