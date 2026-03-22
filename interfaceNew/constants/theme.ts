/**
 * Noir-inspired theme with charcoal surfaces, parchment text, and crimson accents.
 * Built for a sleek, dramatic, high-contrast safety interface.
 */

import { Platform } from "react-native";

// Primary palette - noir / gothic
export const Palette = {
  // Primary text/accent family
  primary: "#D4CCBE",
  primaryLight: "#ECE4D6",
  primaryDark: "#A59C8E",

  // Secondary neutrals
  secondary: "#8E8779",
  secondaryLight: "#B9B2A4",
  secondaryDark: "#625D53",

  // Accent - blood crimson
  accent: "#A41C30",
  accentLight: "#CF5D6E",
  accentDark: "#741321",

  // Success - muted steel
  success: "#7D857A",
  successLight: "#A0A89D",
  successDark: "#5C6459",

  // Warning - antique gold
  warning: "#A88452",
  warningLight: "#C4A57C",
  warningDark: "#7A5F39",

  // Danger/Alert - emergency crimson
  danger: "#C11638",
  dangerLight: "#DB5E78",
  dangerDark: "#890F27",

  // Neutrals
  white: "#F4F0E8",
  cream: "#0B0B0D",
  ivory: "#121214",
  lightGray: "#1D1D21",
  mediumGray: "#333339",
  gray: "#6D6A66",
  darkGray: "#A39C90",
  charcoal: "#E3DDD0",
  dark: "#070709",

  // Transparent overlays
  glassWhite: "rgba(20, 20, 24, 0.82)",
  glassLight: "rgba(20, 20, 24, 0.62)",
  glassDark: "rgba(4, 4, 6, 0.42)",
  shadow: "rgba(0, 0, 0, 0.55)",
};

// Gradient definitions
export const Gradients = {
  primary: ["#ECE4D6", "#D4CCBE"],
  secondary: ["#B9B2A4", "#8E8779"],
  accent: ["#CF5D6E", "#A41C30"],
  success: ["#A0A89D", "#7D857A"],
  warning: ["#C4A57C", "#A88452"],
  danger: ["#DB5E78", "#C11638"],
  background: ["#121214", "#070709"],
  card: ["#1D1D21", "#121214"],
  glass: ["rgba(24, 24, 29, 0.9)", "rgba(20, 20, 24, 0.7)"],
};

export const Colors = {
  light: {
    text: Palette.charcoal,
    textSecondary: Palette.darkGray,
    textMuted: Palette.gray,
    background: Palette.cream,
    backgroundAlt: Palette.ivory,
    card: Palette.lightGray,
    cardAlt: Palette.lightGray,
    tint: Palette.primary,
    icon: Palette.darkGray,
    tabIconDefault: Palette.gray,
    tabIconSelected: Palette.primary,
    border: Palette.mediumGray,
    borderLight: "rgba(212, 204, 190, 0.22)",

    // Semantic colors
    primary: Palette.primary,
    primaryLight: Palette.primaryLight,
    secondary: Palette.secondary,
    secondaryLight: Palette.secondaryLight,
    accent: Palette.accent,
    accentLight: Palette.accentLight,
    success: Palette.success,
    successLight: Palette.successLight,
    warning: Palette.warning,
    warningLight: Palette.warningLight,
    danger: Palette.danger,
    dangerLight: Palette.dangerLight,

    // Glass effects
    glass: Palette.glassWhite,
    glassLight: Palette.glassLight,
    shadow: Palette.shadow,
  },
  dark: {
    text: "#E3DDD0",
    textSecondary: "#A39C90",
    textMuted: "#6D6A66",
    background: Palette.dark,
    backgroundAlt: "#121214",
    card: "#1A1A1E",
    cardAlt: "#232328",
    tint: Palette.primary,
    icon: "#A39C90",
    tabIconDefault: "#6D6A66",
    tabIconSelected: Palette.primary,
    border: "#2A2A30",
    borderLight: "rgba(212, 204, 190, 0.18)",

    // Semantic colors
    primary: Palette.primary,
    primaryLight: Palette.primaryLight,
    secondary: Palette.secondary,
    secondaryLight: Palette.secondaryLight,
    accent: Palette.accent,
    accentLight: Palette.accentLight,
    success: Palette.success,
    successLight: Palette.successLight,
    warning: Palette.warning,
    warningLight: Palette.warningLight,
    danger: Palette.danger,
    dangerLight: Palette.dangerLight,

    // Glass effects
    glass: "rgba(18, 18, 22, 0.85)",
    glassLight: "rgba(18, 18, 22, 0.62)",
    shadow: "rgba(0, 0, 0, 0.6)",
  },
};

// Shared design tokens
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};

export const Shadows = {
  sm: {
    shadowColor: Palette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: Palette.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: Palette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 8,
  },
  glow: {
    shadowColor: Palette.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
