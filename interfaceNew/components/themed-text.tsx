import { StyleSheet, Text, type TextProps, type TextStyle } from "react-native";

import { useThemeColor } from "@/hooks/use-theme-color";
import { Fonts } from "@/constants/theme";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?:
    | "default"
    | "title"
    | "defaultSemiBold"
    | "subtitle"
    | "link"
    | "caption"
    | "label"
    | "hero";
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "default",
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");
  const secondaryColor = useThemeColor({}, "textSecondary");
  const primaryColor = useThemeColor({}, "primary");
  const mutedColor = useThemeColor({}, "textMuted");

  const getTypeStyle = (): TextStyle | undefined => {
    switch (type) {
      case "default":
        return styles.default;
      case "title":
        return styles.title;
      case "defaultSemiBold":
        return styles.defaultSemiBold;
      case "subtitle":
        return styles.subtitle;
      case "link":
        return { ...styles.link, color: primaryColor };
      case "caption":
        return { ...styles.caption, color: secondaryColor };
      case "label":
        return { ...styles.label, color: mutedColor };
      case "hero":
        return styles.hero;
      default:
        return undefined;
    }
  };

  return <Text style={[{ color }, getTypeStyle(), style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.15,
    fontFamily: Fonts?.sans,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    letterSpacing: 0.12,
    fontFamily: Fonts?.sans,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 38,
    letterSpacing: 0.35,
    fontFamily: Fonts?.serif,
    textTransform: "uppercase",
  },
  hero: {
    fontSize: 38,
    fontWeight: "700",
    lineHeight: 46,
    letterSpacing: 0.55,
    fontFamily: Fonts?.serif,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 26,
    letterSpacing: 0.2,
    fontFamily: Fonts?.sans,
  },
  link: {
    lineHeight: 24,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.25,
    fontFamily: Fonts?.sans,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.35,
    fontFamily: Fonts?.sans,
  },
  label: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    fontFamily: Fonts?.sans,
  },
});
