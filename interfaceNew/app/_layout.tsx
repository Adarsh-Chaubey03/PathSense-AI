import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  type Theme,
} from "@react-navigation/native";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { bootstrapApp } from "@/src/bootstrap";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, Palette } from "@/constants/theme";

export const unstable_settings = {
  anchor: "(tabs)",
};

// Noir-inspired light profile (intentionally dark UI)
const LightTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Palette.primary,
    background: Palette.cream,
    card: Palette.lightGray,
    text: Palette.charcoal,
    border: Palette.mediumGray,
    notification: Palette.accent,
  },
};

// Noir-inspired dark profile
const CustomDarkTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Palette.primary,
    background: Palette.dark,
    card: "#1A1A1E",
    text: "#E3DDD0",
    border: "#2A2A30",
    notification: Palette.accent,
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    bootstrapApp().catch((error) => {
      console.warn("[Bootstrap] Failed to initialize app", error);
    });
  }, []);

  return (
    <ThemeProvider
      value={colorScheme === "dark" ? CustomDarkTheme : LightTheme}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: Colors[colorScheme ?? "light"].background,
          },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="monitoring"
          options={{
            headerShown: true,
            headerTitle: "Monitoring",
            headerStyle: {
              backgroundColor: Colors[colorScheme ?? "light"].card,
            },
            headerTintColor: Colors[colorScheme ?? "light"].primary,
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
            headerTitle: "Settings",
            headerStyle: {
              backgroundColor: Colors[colorScheme ?? "light"].card,
            },
            headerTintColor: Colors[colorScheme ?? "light"].primary,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
