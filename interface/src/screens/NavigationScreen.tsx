import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AccessibilityInfo,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {COLORS, SPACING, FONT_SIZES, ALERT_MESSAGES} from '../constants';
import StatusIndicator from '../components/StatusIndicator';
import type {
  NavigationState,
  DegradationMode,
  SensorQuality,
  HazardAlert,
} from '../types';

const NavigationScreen: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [navigationState, setNavigationState] = useState<NavigationState>({
    isActive: false,
    degradationMode: 'full',
    sensorQuality: {
      camera: 1.0,
      imu: 1.0,
      gps: 0.8,
      overall: 0.93,
    },
    motionState: 'stationary',
    currentAlert: null,
    recentAlerts: [],
  });

  const toggleNavigation = useCallback(() => {
    const newState = !isActive;
    setIsActive(newState);
    setNavigationState(prev => ({...prev, isActive: newState}));

    const message = newState
      ? 'Navigation assistance started'
      : 'Navigation assistance stopped';
    AccessibilityInfo.announceForAccessibility(message);
  }, [isActive]);

  useEffect(() => {
    if (isActive) {
      // Placeholder for sensor initialization
      console.log('Sensors would be initialized here');
    }

    return () => {
      if (isActive) {
        console.log('Sensors would be cleaned up here');
      }
    };
  }, [isActive]);

  const getDegradationModeLabel = (mode: DegradationMode): string => {
    switch (mode) {
      case 'full':
        return 'Full Guidance';
      case 'no_gps':
        return 'GPS Unavailable';
      case 'weak_imu':
        return 'Limited Motion Tracking';
      case 'no_camera':
        return 'Camera Unavailable';
      default:
        return 'Unknown Mode';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Navigation
        </Text>
        <Text style={styles.modeLabel}>
          {getDegradationModeLabel(navigationState.degradationMode)}
        </Text>
      </View>

      <View style={styles.cameraPlaceholder}>
        <View style={styles.cameraOverlay}>
          {isActive ? (
            <Text style={styles.cameraText}>Camera Feed Active</Text>
          ) : (
            <Text style={styles.cameraText}>Camera Inactive</Text>
          )}
        </View>

        {navigationState.currentAlert && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertText}>
              {navigationState.currentAlert.message}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.statusSection}>
        <StatusIndicator
          label="Camera"
          value={navigationState.sensorQuality.camera}
        />
        <StatusIndicator
          label="Motion"
          value={navigationState.sensorQuality.imu}
        />
        <StatusIndicator
          label="GPS"
          value={navigationState.sensorQuality.gps}
        />
      </View>

      <View style={styles.motionInfo}>
        <Text style={styles.motionLabel}>Motion State</Text>
        <Text style={styles.motionValue}>
          {navigationState.motionState.charAt(0).toUpperCase() +
            navigationState.motionState.slice(1)}
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            isActive ? styles.stopButton : styles.startButton,
          ]}
          onPress={toggleNavigation}
          accessibilityLabel={
            isActive ? 'Stop navigation' : 'Start navigation'
          }
          accessibilityRole="button">
          <Text style={styles.toggleButtonText}>
            {isActive ? 'Stop' : 'Start'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modeLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.success,
    marginTop: SPACING.xs,
  },
  cameraPlaceholder: {
    flex: 1,
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cameraText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  alertBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.highlight,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  alertText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
  },
  statusSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  motionInfo: {
    alignItems: 'center',
    paddingBottom: SPACING.md,
  },
  motionLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  motionValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: SPACING.xs,
  },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  toggleButton: {
    paddingVertical: SPACING.lg,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: COLORS.success,
  },
  stopButton: {
    backgroundColor: COLORS.error,
  },
  toggleButtonText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
});

export default NavigationScreen;
