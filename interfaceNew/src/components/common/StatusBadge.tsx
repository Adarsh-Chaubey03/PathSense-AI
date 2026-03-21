import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import type { FallEventState } from "@/src/features/fall-event/event.types";

interface StatusBadgeProps {
  state: FallEventState;
}

export function StatusBadge({ state }: StatusBadgeProps) {
  return <ThemedText style={styles.text}>State: {state}</ThemedText>;
}

const styles = StyleSheet.create({
  text: {
    lineHeight: 22,
  },
});
