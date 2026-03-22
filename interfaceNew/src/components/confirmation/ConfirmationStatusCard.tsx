/**
 * ConfirmationStatusCard - Prominent card for fall confirmation messages.
 * Uses warning styling to grab user attention.
 */

import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { BorderRadius, Shadows, Spacing, Palette } from '@/constants/theme';

interface ConfirmationStatusCardProps {
  message: string;
  variant?: 'warning' | 'danger';
}

export function ConfirmationStatusCard({
  message,
  variant = 'warning',
}: ConfirmationStatusCardProps) {
  const warningLight = useThemeColor({}, 'warningLight');
  const warning = useThemeColor({}, 'warning');
  const dangerLight = useThemeColor({}, 'dangerLight');
  const danger = useThemeColor({}, 'danger');
  const cardBg = useThemeColor({}, 'card');

  const isDanger = variant === 'danger';
  const bgColor = isDanger ? dangerLight : warningLight;
  const accentColor = isDanger ? danger : warning;

  return (
    <View style={[styles.card, { backgroundColor: cardBg }, Shadows.md]}>
      <View style={[styles.accentTop, { backgroundColor: accentColor }]} />
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: bgColor }]}>
          <ThemedText style={[styles.icon, { color: accentColor }]}>!</ThemedText>
        </View>
        <ThemedText style={styles.message}>{message}</ThemedText>
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
    fontSize: 24,
    fontWeight: '700',
  },
  message: {
    lineHeight: 24,
    textAlign: 'center',
  },
});
