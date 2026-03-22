/**
 * StatusBadge - Visual indicator for fall event state.
 * Soft, pill-shaped badge with color-coded status.
 */

import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { BorderRadius, Spacing, Palette } from '@/constants/theme';
import type { FallEventState } from '@/src/features/fall-event/event.types';

interface StatusBadgeProps {
  state: FallEventState;
  showDescription?: boolean;
}

const STATE_CONFIG: Record<
  FallEventState,
  { label: string; description: string; colorKey: 'primary' | 'success' | 'warning' | 'danger' | 'accent' }
> = {
  IDLE: {
    label: 'Idle',
    description: 'Monitoring inactive',
    colorKey: 'primary',
  },
  MONITORING: {
    label: 'Active',
    description: 'Monitoring your safety',
    colorKey: 'success',
  },
  CANDIDATE: {
    label: 'Detecting',
    description: 'Analyzing motion pattern',
    colorKey: 'warning',
  },
  CONFIRMING: {
    label: 'Confirming',
    description: 'Waiting for your response',
    colorKey: 'warning',
  },
  ALERTING: {
    label: 'Alert',
    description: 'Dispatching emergency alert',
    colorKey: 'danger',
  },
  ESCALATING: {
    label: 'Escalating',
    description: 'Contacting emergency services',
    colorKey: 'danger',
  },
  RESOLVED: {
    label: 'Resolved',
    description: 'Event completed',
    colorKey: 'success',
  },
  FALSE_ALARM: {
    label: 'Dismissed',
    description: 'False alarm confirmed',
    colorKey: 'accent',
  },
};

export function StatusBadge({ state, showDescription = true }: StatusBadgeProps) {
  const config = STATE_CONFIG[state];

  const primary = useThemeColor({}, 'primary');
  const success = useThemeColor({}, 'success');
  const warning = useThemeColor({}, 'warning');
  const danger = useThemeColor({}, 'danger');
  const accent = useThemeColor({}, 'accent');

  const getColor = () => {
    switch (config.colorKey) {
      case 'success':
        return success;
      case 'warning':
        return warning;
      case 'danger':
        return danger;
      case 'accent':
        return accent;
      default:
        return primary;
    }
  };

  const color = getColor();

  return (
    <View style={styles.container}>
      <View style={[styles.badge, { backgroundColor: color }]}>
        <View style={[styles.dot, { backgroundColor: Palette.white }]} />
        <ThemedText style={styles.label}>{config.label}</ThemedText>
      </View>
      {showDescription && (
        <ThemedText type="caption" style={styles.description}>
          {config.description}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    color: Palette.white,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  description: {
    flex: 1,
  },
});
