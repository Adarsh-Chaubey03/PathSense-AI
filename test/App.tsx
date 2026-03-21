/**
 * Main App Entry Point - IMU Dataset Collection App
 *
 * This app collects high-quality accelerometer and gyroscope data
 * for fall detection research and model training.
 *
 * Features:
 * - Real-time sensor data display
 * - Event labeling (phone drop, table placement, random movement)
 * - Efficient data buffering and storage
 * - Dataset management and sharing
 */

import React from 'react';
import { StyleSheet, View, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from './src/screens/HomeScreen';
import { COLORS } from './src/constants';

// Suppress specific warnings in development
LogBox.ignoreLogs([
  'Setting a timer',
  'VirtualizedLists should never be nested',
]);

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <StatusBar style="light" backgroundColor={COLORS.background} />
        <HomeScreen />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
