/**
 * DispatchStatusCard - Card for emergency dispatch status messages.
 * Uses danger styling to indicate urgency.
 */

import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { BorderRadius, Shadows, Spacing, Palette } from '@/constants/theme';

interface DispatchStatusCardProps {
  message: string;
  isLoading?: boolean;
  success?: boolean;
}

export function DispatchStatusCard({
  message,
  isLoading = false,
  success = false,
}: DispatchStatusCardProps) {
  const dangerLight = useThemeColor({}, 'dangerLight');
  const danger = useThemeColor({}, 'danger');
  const successLight = useThemeColor({}, 'successLight');
  const successColor = useThemeColor({}, 'success');
  const cardBg = useThemeColor({}, 'card');

  const bgColor = success ? successLight : dangerLight;
  const accentColor = success ? successColor : danger;

  return (
    <View style={[styles.card, { backgroundColor: cardBg }, Shadows.md]}>
      <View style={[styles.accentTop, { backgroundColor: accentColor }]} />
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: bgColor }]}>
          {isLoading ? (
            <ActivityIndicator color={accentColor} size="small" />
          ) : (
            <ThemedText style={[styles.icon, { color: accentColor }]}>
              {success ? '✓' : '!'}
            </ThemedText>
          )}
        </View>
        <View style={styles.textContainer}>
          <ThemedText type="subtitle" style={styles.title}>
            {success ? 'Alert Sent' : 'Emergency Active'}
          </ThemedText>
          <ThemedText type="caption" style={styles.message}>
            {message}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  accentTop: {
    height: 4,
  },
  content: {
    padding: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
    fontWeight: '700',
  },
  textContainer: {
    flex: 1,
    gap: Spacing.xs,
  },
  title: {},
  message: {
    lineHeight: 20,
  },
});
