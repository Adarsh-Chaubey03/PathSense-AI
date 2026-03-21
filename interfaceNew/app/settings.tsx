import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { fetchContacts, type EmergencyContact } from "@/src/services/api/contacts";

export default function SettingsScreen() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [status, setStatus] = useState("Loading emergency contacts...");

  useEffect(() => {
    const loadContacts = async (): Promise<void> => {
      try {
        const list = await fetchContacts();
        setContacts(list);
        setStatus(
          list.length > 0
            ? `Loaded ${list.length} emergency contact(s).`
            : "No emergency contacts configured yet.",
        );
      } catch {
        setStatus("Unable to reach backend for contacts.");
      }
    };

    void loadContacts();
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Settings</ThemedText>
      <ThemedText style={styles.body}>{status}</ThemedText>
      {contacts.map((contact) => (
        <ThemedText style={styles.body} key={`${contact.name}-${contact.phone}`}>
          {contact.name} — {contact.phone}
        </ThemedText>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    gap: 12,
  },
  body: {
    lineHeight: 22,
  },
});
