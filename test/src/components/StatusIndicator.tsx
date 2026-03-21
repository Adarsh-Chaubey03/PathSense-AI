/**
 * StatusIndicator Component - Shows app status and sensor availability
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, RADIUS } from '../constants';

interface StatusIndicatorProps {
  sensorsAvailable: boolean;
  isRecording: boolean;
  message?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = memo(({
  sensorsAvailable,
  isRecording,
  message,
}) => {
  const getStatusColor = () => {
    if (!sensorsAvailable) return COLORS.error;
    if (isRecording) return COLORS.recording;
    return COLORS.success;
  };

  const getStatusText = () => {
    if (!sensorsAvailable) return 'Sensors Unavailable';
    if (isRecording) return 'Recording...';
    return 'Ready';
  };

  const statusColor = getStatusColor();

  return (
    <View style={[styles.container, { borderColor: statusColor + '50' }]}>
      <View style={[styles.dot, { backgroundColor: statusColor }]} />
      <View style={styles.textContainer}>
        <Text style={[styles.statusText, { color: statusColor }]}>
          {getStatusText()}
        </Text>
        {message && (
          <Text style={styles.messageText}>{message}</Text>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    gap: SPACING.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  textContainer: {
    flex: 1,
  },
  statusText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  messageText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});

StatusIndicator.displayName = 'StatusIndicator';
export default StatusIndicator;
