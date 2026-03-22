/**
 * Styled Button component with soft, rounded aesthetic.
 * Supports variants: primary, secondary, success, danger, ghost, outline
 */

import {
  StyleSheet,
  TouchableOpacity,
  View,
  type TouchableOpacityProps,
  ActivityIndicator,
} from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { BorderRadius, Shadows, Spacing, Palette } from "@/constants/theme";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "ghost"
  | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = TouchableOpacityProps & {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
};

export function Button({
  title,
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconPosition = "left",
  fullWidth = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const primaryColor = useThemeColor({}, "primary");
  const secondaryColor = useThemeColor({}, "secondary");
  const successColor = useThemeColor({}, "success");
  const dangerColor = useThemeColor({}, "danger");
  const borderColor = useThemeColor({}, "borderLight");
  const shadowColor = useThemeColor({}, "shadow");

  const getBackgroundColor = () => {
    if (disabled) return Palette.mediumGray;
    switch (variant) {
      case "primary":
        return primaryColor;
      case "secondary":
        return secondaryColor;
      case "success":
        return successColor;
      case "danger":
        return dangerColor;
      case "ghost":
      case "outline":
        return "transparent";
      default:
        return primaryColor;
    }
  };

  const getTextColor = () => {
    if (disabled) return Palette.gray;
    switch (variant) {
      case "primary":
      case "secondary":
      case "success":
      case "danger":
        return "#FFFFFF";
      case "ghost":
        return primaryColor;
      case "outline":
        return primaryColor;
      default:
        return "#FFFFFF";
    }
  };

  const getSizeStyle = () => {
    switch (size) {
      case "sm":
        return styles.sizeSm;
      case "lg":
        return styles.sizeLg;
      default:
        return styles.sizeMd;
    }
  };

  const getTextSize = () => {
    switch (size) {
      case "sm":
        return { fontSize: 14 };
      case "lg":
        return { fontSize: 18 };
      default:
        return { fontSize: 16 };
    }
  };

  const backgroundColor = getBackgroundColor();
  const textColor = getTextColor();

  return (
    <TouchableOpacity
      style={[
        styles.base,
        getSizeStyle(),
        { backgroundColor },
        { borderColor },
        variant === "outline" && [
          styles.outline,
          { borderColor: primaryColor },
        ],
        variant !== "ghost" &&
          variant !== "outline" && [{ shadowColor }, Shadows.sm],
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
      disabled={disabled || loading}
      activeOpacity={0.8}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === "left" && (
            <View style={styles.iconLeft}>{icon}</View>
          )}
          <ThemedText
            style={[styles.text, getTextSize(), { color: textColor }]}
          >
            {title}
          </ThemedText>
          {icon && iconPosition === "right" && (
            <View style={styles.iconRight}>{icon}</View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    borderWidth: 1,
  },
  sizeSm: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 36,
  },
  sizeMd: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight: 48,
  },
  sizeLg: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    minHeight: 54,
  },
  outline: {
    borderWidth: 1,
  },
  fullWidth: {
    width: "100%",
  },
  disabled: {
    opacity: 0.6,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  iconLeft: {
    marginRight: Spacing.sm,
  },
  iconRight: {
    marginLeft: Spacing.sm,
  },
});
