/**
 * CountdownTimer - Circular countdown display with animated progress.
 * Soft, visually prominent timer for urgent confirmations.
 */

import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { BorderRadius, Shadows, Spacing, Palette } from '@/constants/theme';

interface CountdownTimerProps {
  secondsLeft: number;
  totalSeconds?: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'danger';
}

export function CountdownTimer({
  secondsLeft,
  totalSeconds = 30,
  label,
  size = 'md',
  variant = 'default',
}: CountdownTimerProps) {
  const primary = useThemeColor({}, 'primary');
  const primaryLight = useThemeColor({}, 'primaryLight');
  const danger = useThemeColor({}, 'danger');
  const dangerLight = useThemeColor({}, 'dangerLight');
  const cardBg = useThemeColor({}, 'card');

  // Auto-switch to danger variant when time is low
  const isUrgent = secondsLeft <= 10 || variant === 'danger';
  const activeColor = isUrgent ? danger : primary;
  const bgColor = isUrgent ? dangerLight : primaryLight;

  const progress = Math.max(0, Math.min(1, secondsLeft / totalSeconds));

  const getSize = () => {
    switch (size) {
      case 'sm':
        return { container: 90, circle: 74, fontSize: 24 };
      case 'lg':
        return { container: 160, circle: 140, fontSize: 48 };
      default:
        return { container: 130, circle: 110, fontSize: 36 };
    }
  };

  const dimensions = getSize();

  return (
    <View style={styles.wrapper}>
      {label && (
        <ThemedText type="caption" style={styles.label}>
          {label}
        </ThemedText>
      )}
      <View
        style={[
          styles.container,
          {
            width: dimensions.container,
            height: dimensions.container,
            backgroundColor: bgColor,
          },
        ]}
      >
        <View
          style={[
            styles.innerCircle,
            {
              width: dimensions.circle,
              height: dimensions.circle,
              backgroundColor: cardBg,
            },
            Shadows.sm,
          ]}
        >
          <ThemedText
            style={[
              styles.time,
              {
                fontSize: dimensions.fontSize,
                lineHeight: dimensions.fontSize * 1.1,
                color: activeColor,
              },
            ]}
          >
            {secondsLeft}
          </ThemedText>
          <ThemedText
            type="label"
            style={[styles.unit, { color: activeColor }]}
          >
            SEC
          </ThemedText>
        </View>
        {/* Progress indicator */}
        <View
          style={[
            styles.progressRing,
            {
              borderColor: activeColor,
              borderWidth: 3,
              opacity: progress,
            },
          ]}
        />
      </View>
      {isUrgent && secondsLeft > 0 && (
        <ThemedText
          type="caption"
          style={[styles.urgentText, { color: danger }]}
        >
          Respond quickly!
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: Spacing.sm,
    overflow: 'visible',
  },
  label: {
    marginBottom: Spacing.xs,
  },
  container: {
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  innerCircle: {
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  time: {
    fontWeight: '700',
    letterSpacing: -1,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  unit: {
    marginTop: -4,
    fontSize: 10,
  },
  progressRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.full,
  },
  urgentText: {
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
});
