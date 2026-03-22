/**
 * Styled Card component with soft shadows and rounded corners.
 * Supports variants: default, elevated, glass
 */

import { StyleSheet, View, type ViewProps } from "react-native";
import { useThemeColor } from "@/hooks/use-theme-color";
import { BorderRadius, Shadows, Spacing } from "@/constants/theme";

export type CardVariant = "default" | "elevated" | "glass" | "outlined";

export type CardProps = ViewProps & {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
};

export function Card({
  style,
  variant = "default",
  padding = "md",
  children,
  ...props
}: CardProps) {
  const backgroundColor = useThemeColor(
    {},
    variant === "glass" ? "glass" : "card",
  );
  const borderColor = useThemeColor({}, "borderLight");
  const shadowColor = useThemeColor({}, "shadow");

  const getPaddingStyle = () => {
    switch (padding) {
      case "none":
        return { padding: 0 };
      case "sm":
        return { padding: Spacing.md };
      case "md":
        return { padding: Spacing.lg };
      case "lg":
        return { padding: Spacing.xl };
      default:
        return { padding: Spacing.lg };
    }
  };

  const getVariantStyle = () => {
    switch (variant) {
      case "elevated":
        return [styles.elevated, { borderColor }, { shadowColor }, Shadows.md];
      case "glass":
        return [styles.glass, { borderColor }, { shadowColor }, Shadows.sm];
      case "outlined":
        return [styles.outlined, { borderColor }];
      default:
        return [styles.default, { borderColor }, { shadowColor }, Shadows.sm];
    }
  };

  return (
    <View
      style={[
        styles.base,
        { backgroundColor },
        getPaddingStyle(),
        ...getVariantStyle(),
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
  },
  default: {},
  elevated: {
    borderWidth: 1,
  },
  glass: {
    borderWidth: 1,
  },
  outlined: {
    borderWidth: 1,
    backgroundColor: "transparent",
  },
});
