import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { getFallEvent, transitionFallEvent } from "@/src/state/fall-event-store";

export default function ConfirmScreen() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    const { state } = getFallEvent();

    if (state === "MONITORING") {
      transitionFallEvent("CANDIDATE", "Candidate inferred at confirm screen entry");
    }

    if (getFallEvent().state === "CANDIDATE") {
      transitionFallEvent("CONFIRMING", "Confirmation screen active");
    }
  }, []);

  const handleImOk = (): void => {
    if (getFallEvent().state === "CONFIRMING") {
      transitionFallEvent("FALSE_ALARM", "User confirmed safety");
    }

    router.push("./result");
  };

  const handleEscalate = (): void => {
    if (getFallEvent().state === "CONFIRMING") {
      transitionFallEvent("ALERTING", "No confirmation response");
    }

    router.push("./alert");
  };

  useEffect(() => {
    if (secondsLeft <= 0) {
      handleEscalate();
      return;
    }

    const timer = setTimeout(() => {
      setSecondsLeft((previous) => previous - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [secondsLeft]);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Are you okay?</ThemedText>
      <ThemedText style={styles.body}>Confirmation stage active.</ThemedText>
      <ThemedText style={styles.body}>Timer: {secondsLeft}s</ThemedText>
      <ThemedText style={styles.body}>State: {getFallEvent().state}</ThemedText>
      <TouchableOpacity onPress={handleImOk} style={styles.link}>
        <ThemedText type="link">I&apos;m OK</ThemedText>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleEscalate} style={styles.link}>
        <ThemedText type="link">No response / escalate</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    gap: 10,
  },
  body: {
    lineHeight: 22,
  },
  link: {
    marginTop: 8,
  },
});
