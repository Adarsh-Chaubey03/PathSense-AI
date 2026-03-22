/**
 * Soft anime-inspired theme with pastel colors and gentle gradients.
 * Light-themed, minimal, and calming aesthetic.
 */

import { Platform } from 'react-native';

// Primary palette - soft pastels
export const Palette = {
  // Primary accent - soft lavender/purple
  primary: '#9B8FE4',
  primaryLight: '#C4BAFF',
  primaryDark: '#7B6FD4',

  // Secondary - soft pink/rose
  secondary: '#F5A9B8',
  secondaryLight: '#FFD1DC',
  secondaryDark: '#E589A0',

  // Accent - soft mint/teal
  accent: '#7ECEC0',
  accentLight: '#A8E6CF',
  accentDark: '#5EBEA8',

  // Success - soft green
  success: '#88D498',
  successLight: '#B8E6C0',
  successDark: '#68C478',

  // Warning - soft amber
  warning: '#F7D794',
  warningLight: '#FFE8B8',
  warningDark: '#E7C774',

  // Danger/Alert - soft coral (not harsh red)
  danger: '#FF8A80',
  dangerLight: '#FFB8B0',
  dangerDark: '#FF6B60',

  // Neutrals
  white: '#FFFFFF',
  cream: '#FEFBF6',
  ivory: '#F8F6F4',
  lightGray: '#F0EEF6',
  mediumGray: '#D4D2E0',
  gray: '#9896A4',
  darkGray: '#6B6980',
  charcoal: '#3D3B4A',
  dark: '#1A1825',

  // Transparent overlays
  glassWhite: 'rgba(255, 255, 255, 0.75)',
  glassLight: 'rgba(255, 255, 255, 0.5)',
  glassDark: 'rgba(26, 24, 37, 0.08)',
  shadow: 'rgba(155, 143, 228, 0.15)',
};

// Gradient definitions
export const Gradients = {
  primary: ['#C4BAFF', '#9B8FE4'],
  secondary: ['#FFD1DC', '#F5A9B8'],
  accent: ['#A8E6CF', '#7ECEC0'],
  success: ['#B8E6C0', '#88D498'],
  warning: ['#FFE8B8', '#F7D794'],
  danger: ['#FFB8B0', '#FF8A80'],
  background: ['#FEFBF6', '#F8F6F4'],
  card: ['#FFFFFF', '#FEFBF6'],
  glass: ['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.7)'],
};

export const Colors = {
  light: {
    text: Palette.charcoal,
    textSecondary: Palette.gray,
    textMuted: Palette.mediumGray,
    background: Palette.cream,
    backgroundAlt: Palette.ivory,
    card: Palette.white,
    cardAlt: Palette.lightGray,
    tint: Palette.primary,
    icon: Palette.gray,
    tabIconDefault: Palette.mediumGray,
    tabIconSelected: Palette.primary,
    border: Palette.lightGray,
    borderLight: 'rgba(155, 143, 228, 0.2)',

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
    text: '#ECEDEE',
    textSecondary: '#9BA1A6',
    textMuted: '#687076',
    background: Palette.dark,
    backgroundAlt: '#242230',
    card: '#2A2838',
    cardAlt: '#333140',
    tint: Palette.primaryLight,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: Palette.primaryLight,
    border: '#333140',
    borderLight: 'rgba(196, 186, 255, 0.15)',

    // Semantic colors (slightly muted for dark mode)
    primary: Palette.primaryLight,
    primaryLight: Palette.primary,
    secondary: Palette.secondaryLight,
    secondaryLight: Palette.secondary,
    accent: Palette.accentLight,
    accentLight: Palette.accent,
    success: Palette.successLight,
    successLight: Palette.success,
    warning: Palette.warningLight,
    warningLight: Palette.warning,
    danger: Palette.dangerLight,
    dangerLight: Palette.danger,

    // Glass effects
    glass: 'rgba(42, 40, 56, 0.85)',
    glassLight: 'rgba(42, 40, 56, 0.6)',
    shadow: 'rgba(0, 0, 0, 0.3)',
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
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
