import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AccessibilityInfo,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {COLORS, SPACING, FONT_SIZES, APP_NAME} from '../constants';
import type {RootStackParamList} from '../types';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();

  const handleStartNavigation = () => {
    AccessibilityInfo.announceForAccessibility('Starting navigation assistance');
    navigation.navigate('Navigation');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {APP_NAME}
        </Text>
        <Text style={styles.subtitle}>
          Assistive Navigation System
        </Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.description}>
          Real-time navigation assistance for visually impaired users.
          Using camera, motion sensors, and GPS to detect obstacles and
          provide voice and haptic guidance.
        </Text>

        <View style={styles.statusContainer}>
          <StatusItem label="Camera" status="ready" />
          <StatusItem label="Sensors" status="ready" />
          <StatusItem label="GPS" status="ready" />
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.startButton}
          onPress={handleStartNavigation}
          accessibilityLabel="Start navigation assistance"
          accessibilityRole="button"
          accessibilityHint="Double tap to begin navigation mode">
          <Text style={styles.startButtonText}>Start Navigation</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          This system provides supplementary guidance. Always use primary
          mobility aids and remain aware of your surroundings.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const StatusItem: React.FC<{label: string; status: 'ready' | 'warning' | 'error'}> = ({
  label,
  status,
}) => {
  const statusColor =
    status === 'ready'
      ? COLORS.success
      : status === 'warning'
      ? COLORS.warning
      : COLORS.error;

  return (
    <View
      style={styles.statusItem}
      accessibilityLabel={`${label} status: ${status}`}>
      <View style={[styles.statusDot, {backgroundColor: statusColor}]} />
      <Text style={styles.statusLabel}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
  },
  description: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: SPACING.sm,
  },
  statusLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  startButton: {
    backgroundColor: COLORS.highlight,
    paddingVertical: SPACING.lg,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  startButtonText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  disclaimer: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default HomeScreen;
