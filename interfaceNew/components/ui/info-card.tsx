/**
 * InfoCard component for displaying labeled data with icon support.
 * Used for sensor data, status info, etc.
 */

import { StyleSheet, View, type ViewProps } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { BorderRadius, Shadows, Spacing } from '@/constants/theme';

export type InfoCardProps = ViewProps & {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'accent';
  size?: 'sm' | 'md';
};

export function InfoCard({
  label,
  value,
  icon,
  variant = 'default',
  size = 'md',
  style,
  ...props
}: InfoCardProps) {
  const cardBg = useThemeColor({}, 'card');
  const primaryLight = useThemeColor({}, 'primaryLight');
  const successLight = useThemeColor({}, 'successLight');
  const warningLight = useThemeColor({}, 'warningLight');
  const dangerLight = useThemeColor({}, 'dangerLight');
  const accentLight = useThemeColor({}, 'accentLight');

  const getAccentColor = () => {
    switch (variant) {
      case 'success':
        return successLight;
      case 'warning':
        return warningLight;
      case 'danger':
        return dangerLight;
      case 'accent':
        return accentLight;
      default:
        return primaryLight;
    }
  };

  const accentColor = getAccentColor();

  return (
    <View
      style={[
        styles.base,
        size === 'sm' ? styles.baseSm : styles.baseMd,
        { backgroundColor: cardBg },
        Shadows.sm,
        style,
      ]}
      {...props}
    >
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
      <View style={styles.content}>
        {icon && <View style={styles.icon}>{icon}</View>}
        <View style={styles.textContainer}>
          <ThemedText type="label" style={styles.label}>
            {label}
          </ThemedText>
          <ThemedText
            type={size === 'sm' ? 'default' : 'subtitle'}
            style={styles.value}
            numberOfLines={1}
          >
            {value}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  baseSm: {
    minHeight: 56,
  },
  baseMd: {
    minHeight: 72,
  },
  accentBar: {
    width: 4,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(155, 143, 228, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  label: {
    marginBottom: 2,
  },
  value: {
    fontWeight: '600',
  },
});
