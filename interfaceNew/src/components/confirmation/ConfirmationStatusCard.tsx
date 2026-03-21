import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

interface ConfirmationStatusCardProps {
  message: string;
}

export function ConfirmationStatusCard({
  message,
}: ConfirmationStatusCardProps) {
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
