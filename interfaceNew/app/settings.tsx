import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, View, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Card, Button } from "@/components/ui";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Spacing, BorderRadius, Palette } from "@/constants/theme";
import {
  fetchContacts,
  type EmergencyContact,
} from "@/src/services/api/contacts";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [status, setStatus] = useState("Loading emergency contacts...");
  const [isLoading, setIsLoading] = useState(true);

  const primaryColor = useThemeColor({}, "primary");
  const primaryLight = useThemeColor({}, "primaryLight");
  const secondaryLight = useThemeColor({}, "secondaryLight");
  const accentColor = useThemeColor({}, "accent");

  useEffect(() => {
    const loadContacts = async (): Promise<void> => {
      try {
        const list = await fetchContacts();
        setContacts(list);
        setStatus(
          list.length > 0
            ? `${list.length} emergency contact(s) configured`
            : "No emergency contacts configured yet",
        );
      } catch {
        setStatus("Unable to reach backend for contacts");
      } finally {
        setIsLoading(false);
      }
    };

    void loadContacts();
  }, []);

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
          <ThemedText type="title">Settings</ThemedText>
        </View>

        {/* Profile Card */}
        <Card variant="glass" style={styles.profileCard}>
          <View style={[styles.avatar, { backgroundColor: primaryLight }]}>
            <ThemedText style={styles.avatarText}>PS</ThemedText>
          </View>
          <ThemedText type="subtitle">PathSense User</ThemedText>
          <ThemedText type="caption">Fall detection enabled</ThemedText>
        </Card>

        {/* Emergency Contacts Section */}
        <View style={styles.section}>
          <ThemedText type="label" style={styles.sectionLabel}>
            Emergency Contacts
          </ThemedText>
          <Card variant="default" padding="none">
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={primaryColor} />
                <ThemedText type="caption">Loading contacts...</ThemedText>
              </View>
            ) : contacts.length > 0 ? (
              contacts.map((contact, index) => (
                <View
                  key={`${contact.name}-${contact.phone}`}
                  style={[
                    styles.contactItem,
                    index < contacts.length - 1 && styles.contactItemBorder,
                  ]}
                >
                  <View
                    style={[
                      styles.contactAvatar,
                      { backgroundColor: secondaryLight },
                    ]}
                  >
                    <ThemedText style={styles.contactInitial}>
                      {contact.name.charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                  <View style={styles.contactInfo}>
                    <ThemedText type="defaultSemiBold">
                      {contact.name}
                    </ThemedText>
                    <ThemedText type="caption">{contact.phone}</ThemedText>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyContainer}>
                <ThemedText type="caption" style={styles.emptyText}>
                  No emergency contacts configured
                </ThemedText>
              </View>
            )}
          </Card>
          <ThemedText type="caption" style={styles.statusText}>
            {status}
          </ThemedText>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <ThemedText type="label" style={styles.sectionLabel}>
            Notifications
          </ThemedText>
          <Card variant="outlined" padding="md">
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <ThemedText type="defaultSemiBold">
                  Push Notifications
                </ThemedText>
                <ThemedText type="caption">
                  Receive alerts and updates
                </ThemedText>
              </View>
              <View style={[styles.toggleOn, { backgroundColor: accentColor }]}>
                <ThemedText style={styles.toggleText}>ON</ThemedText>
              </View>
            </View>
          </Card>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <ThemedText type="label" style={styles.sectionLabel}>
            About
          </ThemedText>
          <Card variant="outlined" padding="md">
            <View style={styles.aboutRow}>
              <ThemedText>Version</ThemedText>
              <ThemedText type="caption">1.0.0</ThemedText>
            </View>
            <View style={styles.aboutRow}>
              <ThemedText>ML Model</ThemedText>
              <ThemedText type="caption">Fall Detection v2</ThemedText>
            </View>
          </Card>
        </View>

        {/* Back Button */}
        <Button
          title="Back to Home"
          variant="ghost"
          onPress={() => router.push("/")}
          style={styles.backButton}
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
    marginBottom: Spacing.sm,
  },
  profileCard: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: Palette.white,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    marginLeft: Spacing.sm,
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  contactItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(155, 143, 228, 0.1)",
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  contactInitial: {
    fontSize: 18,
    fontWeight: "600",
    color: Palette.charcoal,
  },
  contactInfo: {
    flex: 1,
    gap: 2,
  },
  emptyContainer: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    opacity: 0.6,
  },
  statusText: {
    marginLeft: Spacing.sm,
    opacity: 0.7,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingInfo: {
    flex: 1,
    gap: 2,
  },
  toggleOn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: Palette.white,
  },
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  backButton: {
    marginTop: Spacing.md,
  },
});
