/**
 * AlertBanner component for displaying important messages.
 * Supports variants: info, success, warning, danger
 */

import { StyleSheet, View, type ViewProps } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { BorderRadius, Spacing } from '@/constants/theme';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export type AlertBannerProps = ViewProps & {
  message: string;
  title?: string;
  variant?: AlertVariant;
  icon?: React.ReactNode;
};

export function AlertBanner({
  message,
  title,
  variant = 'info',
  icon,
  style,
  ...props
}: AlertBannerProps) {
  const primaryLight = useThemeColor({}, 'primaryLight');
  const successLight = useThemeColor({}, 'successLight');
  const warningLight = useThemeColor({}, 'warningLight');
  const dangerLight = useThemeColor({}, 'dangerLight');
  const primary = useThemeColor({}, 'primary');
  const success = useThemeColor({}, 'success');
  const warning = useThemeColor({}, 'warning');
  const danger = useThemeColor({}, 'danger');

  const getColors = () => {
    switch (variant) {
      case 'success':
        return { bg: successLight, text: success, border: success };
      case 'warning':
        return { bg: warningLight, text: warning, border: warning };
      case 'danger':
        return { bg: dangerLight, text: danger, border: danger };
      default:
        return { bg: primaryLight, text: primary, border: primary };
    }
  };

  const colors = getColors();

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: colors.bg,
          borderLeftColor: colors.border,
        },
        style,
      ]}
      {...props}
    >
      {icon && (
        <View style={[styles.iconContainer, { backgroundColor: colors.border }]}>
          {icon}
        </View>
      )}
      <View style={styles.content}>
        {title && (
          <ThemedText
            type="defaultSemiBold"
            style={[styles.title, { color: colors.text }]}
          >
            {title}
          </ThemedText>
        )}
        <ThemedText style={[styles.message, { color: colors.text }]}>
          {message}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: Spacing.xs,
  },
  title: {
    marginBottom: 2,
  },
  message: {
    lineHeight: 22,
    opacity: 0.9,
  },
});
