import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

interface DispatchStatusCardProps {
  message: string;
}

export function DispatchStatusCard({ message }: DispatchStatusCardProps) {
  return (
    <ThemedView style={styles.card}>
      <ThemedText style={styles.text}>{message}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderRadius: 10,
  },
  text: {
    lineHeight: 22,
  },
});
