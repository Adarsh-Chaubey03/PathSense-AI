import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  AccessibilityInfo,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {COLORS, SPACING, FONT_SIZES, APP_VERSION} from '../constants';
import type {UserSettings, PriorityLevel} from '../types';

const SettingsScreen: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>({
    voiceEnabled: true,
    hapticEnabled: true,
    voiceVolume: 1.0,
    hapticIntensity: 1.0,
    speechRate: 0.5,
    alertThreshold: 'medium',
  });

  const updateSetting = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    setSettings(prev => ({...prev, [key]: value}));
  };

  const toggleVoice = () => {
    const newValue = !settings.voiceEnabled;
    updateSetting('voiceEnabled', newValue);
    AccessibilityInfo.announceForAccessibility(
      `Voice feedback ${newValue ? 'enabled' : 'disabled'}`,
    );
  };

  const toggleHaptic = () => {
    const newValue = !settings.hapticEnabled;
    updateSetting('hapticEnabled', newValue);
    AccessibilityInfo.announceForAccessibility(
      `Haptic feedback ${newValue ? 'enabled' : 'disabled'}`,
    );
  };

  const setAlertThreshold = (threshold: PriorityLevel) => {
    updateSetting('alertThreshold', threshold);
    AccessibilityInfo.announceForAccessibility(
      `Alert threshold set to ${threshold}`,
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Feedback</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Voice Guidance</Text>
              <Text style={styles.settingDescription}>
                Spoken navigation instructions
              </Text>
            </View>
            <Switch
              value={settings.voiceEnabled}
              onValueChange={toggleVoice}
              trackColor={{false: COLORS.border, true: COLORS.highlight}}
              thumbColor={COLORS.text}
              accessibilityLabel="Toggle voice guidance"
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Haptic Feedback</Text>
              <Text style={styles.settingDescription}>
                Vibration patterns for alerts
              </Text>
            </View>
            <Switch
              value={settings.hapticEnabled}
              onValueChange={toggleHaptic}
              trackColor={{false: COLORS.border, true: COLORS.highlight}}
              thumbColor={COLORS.text}
              accessibilityLabel="Toggle haptic feedback"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Alert Sensitivity</Text>
          <Text style={styles.sectionDescription}>
            Choose which alerts to receive
          </Text>

          <View style={styles.thresholdContainer}>
            {(['high', 'medium', 'low'] as PriorityLevel[]).map(threshold => (
              <TouchableOpacity
                key={threshold}
                style={[
                  styles.thresholdButton,
                  settings.alertThreshold === threshold &&
                    styles.thresholdButtonActive,
                ]}
                onPress={() => setAlertThreshold(threshold)}
                accessibilityLabel={`Set alert threshold to ${threshold}`}
                accessibilityRole="button"
                accessibilityState={{
                  selected: settings.alertThreshold === threshold,
                }}>
                <Text
                  style={[
                    styles.thresholdText,
                    settings.alertThreshold === threshold &&
                      styles.thresholdTextActive,
                  ]}>
                  {threshold.charAt(0).toUpperCase() + threshold.slice(1)}
                </Text>
                <Text style={styles.thresholdDescription}>
                  {threshold === 'high'
                    ? 'Critical only'
                    : threshold === 'medium'
                    ? 'All hazards'
                    : 'Everything'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>

          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>{APP_VERSION}</Text>
          </View>

          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Purpose</Text>
            <Text style={styles.aboutValue}>Assistive Navigation</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          PathSense AI provides supplementary navigation assistance. It should
          not replace primary mobility aids or professional guidance. Always
          remain aware of your surroundings.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xl,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  sectionDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  settingInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  settingLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
    color: COLORS.text,
  },
  settingDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  thresholdContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  thresholdButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thresholdButtonActive: {
    borderColor: COLORS.highlight,
  },
  thresholdText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  thresholdTextActive: {
    color: COLORS.highlight,
  },
  thresholdDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.sm,
  },
  aboutLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  aboutValue: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: '500',
  },
  disclaimer: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: SPACING.lg,
  },
});

export default SettingsScreen;
