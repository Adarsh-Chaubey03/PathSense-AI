import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from '@react-navigation/native';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { bootstrapApp } from '@/src/bootstrap';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Palette } from '@/constants/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Custom light theme with pastel colors
const LightTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Palette.primary,
    background: Palette.cream,
    card: Palette.white,
    text: Palette.charcoal,
    border: Palette.lightGray,
    notification: Palette.secondary,
  },
};

// Custom dark theme
const CustomDarkTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Palette.primaryLight,
    background: Palette.dark,
    card: '#2A2838',
    text: '#ECEDEE',
    border: '#333140',
    notification: Palette.secondaryLight,
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    bootstrapApp().catch((error) => {
      console.warn('[Bootstrap] Failed to initialize app', error);
    });
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? CustomDarkTheme : LightTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: Colors[colorScheme ?? 'light'].background,
          },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="monitoring"
          options={{
            headerShown: true,
            headerTitle: 'Monitoring',
            headerStyle: {
              backgroundColor: Colors[colorScheme ?? 'light'].card,
            },
            headerTintColor: Colors[colorScheme ?? 'light'].primary,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="confirm"
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="alert"
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="result"
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: true,
            headerTitle: 'Settings',
            headerStyle: {
              backgroundColor: Colors[colorScheme ?? 'light'].card,
            },
            headerTintColor: Colors[colorScheme ?? 'light'].primary,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="modal"
          options={{ presentation: 'modal', title: 'Modal' }}
        />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
