import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import type { FallEventState } from "@/src/features/fall-event/event.types";

interface StatusBadgeProps {
  state: FallEventState;
}

const STATE_GUIDANCE: Record<FallEventState, string> = {
  IDLE: "Monitoring inactive.",
  MONITORING: "Monitoring active.",
  CANDIDATE: "Possible fall candidate identified.",
  CONFIRMING: "Waiting for user confirmation.",
  ALERTING: "Emergency alert dispatch in progress.",
  ESCALATING: "Escalating to emergency workflow.",
  RESOLVED: "Event resolved.",
  FALSE_ALARM: "False alarm dismissed.",
};

export function StatusBadge({ state }: StatusBadgeProps) {
  return (
    <ThemedText style={styles.text}>
      State: {state} — {STATE_GUIDANCE[state]}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  text: {
    lineHeight: 22,
  },
});
