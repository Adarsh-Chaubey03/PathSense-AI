import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";

interface CountdownTimerProps {
  secondsLeft: number;
  label?: string;
}

export function CountdownTimer({
  secondsLeft,
  label = "Timer",
}: CountdownTimerProps) {
  return (
    <ThemedText style={styles.text}>
      {label}: {secondsLeft}s
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  text: {
    lineHeight: 22,
  },
});
