/**
 * RecordingControls Component - Start/Stop recording buttons
 *
 * Features:
 * - Large, accessible buttons
 * - Visual state indication
 * - Recording animation
 */

import React, { memo, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, RADIUS } from '../constants';

interface RecordingControlsProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  disabled?: boolean;
}

export const RecordingControls: React.FC<RecordingControlsProps> = memo(({
  isRecording,
  onStartRecording,
  onStopRecording,
  disabled = false,
}) => {
  // Pulse animation for recording indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      // Create pulsing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }

    return () => {
      pulseAnim.stopAnimation();
    };
  }, [isRecording, pulseAnim]);

  const handlePress = () => {
    if (disabled) return;

    if (isRecording) {
      onStopRecording();
    } else {
      onStartRecording();
    }
  };

  return (
    <View style={styles.container}>
      {/* Recording indicator dot */}
      {isRecording && (
        <View style={styles.indicatorContainer}>
          <Animated.View
            style={[
              styles.recordingDot,
              { transform: [{ scale: pulseAnim }] },
            ]}
          />
          <Text style={styles.recordingText}>REC</Text>
        </View>
      )}

      {/* Main control button */}
      <TouchableOpacity
        style={[
          styles.mainButton,
          isRecording ? styles.stopButton : styles.startButton,
          disabled && styles.disabledButton,
        ]}
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
        accessibilityRole="button"
      >
        <View style={[
          styles.buttonIcon,
          isRecording ? styles.stopIcon : styles.startIcon,
        ]} />
        <Text style={styles.buttonText}>
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </Text>
      </TouchableOpacity>

      {/* Status text */}
      <Text style={styles.statusText}>
        {disabled
          ? 'Select an event type to begin'
          : isRecording
          ? 'Tap to stop and save data'
          : 'Tap to begin collecting data'}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.recording + '20',
    borderRadius: RADIUS.full,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.recording,
  },
  recordingText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
    color: COLORS.recording,
    letterSpacing: 2,
  },
  mainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xxl,
    borderRadius: RADIUS.full,
    gap: SPACING.md,
    minWidth: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  startButton: {
    backgroundColor: COLORS.primary,
  },
  stopButton: {
    backgroundColor: COLORS.recording,
  },
  disabledButton: {
    backgroundColor: COLORS.surfaceLight,
    opacity: 0.6,
  },
  buttonIcon: {
    width: 20,
    height: 20,
  },
  startIcon: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: COLORS.text,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: 4,
  },
  stopIcon: {
    width: 16,
    height: 16,
    backgroundColor: COLORS.text,
    borderRadius: 2,
  },
  buttonText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});

RecordingControls.displayName = 'RecordingControls';
export default RecordingControls;
