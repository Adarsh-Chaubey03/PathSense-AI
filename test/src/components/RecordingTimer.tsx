/**
 * RecordingTimer Component - Displays recording duration
 *
 * Features:
 * - Real-time elapsed time display
 * - Data point counter
 * - Visual feedback during recording
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, RADIUS } from '../constants';
import { formatDurationWithMs } from '../utils';

interface RecordingTimerProps {
  isRecording: boolean;
  elapsedTime: number;
  dataPointCount: number;
}

export const RecordingTimer: React.FC<RecordingTimerProps> = memo(({
  isRecording,
  elapsedTime,
  dataPointCount,
}) => {
  if (!isRecording && elapsedTime === 0) {
    return null;
  }

  const formattedTime = formatDurationWithMs(elapsedTime);
  const samplesPerSecond = elapsedTime > 0
    ? Math.round((dataPointCount / elapsedTime) * 1000)
    : 0;

  return (
    <View style={styles.container}>
      {/* Main timer display */}
      <View style={styles.timerDisplay}>
        <Text style={styles.timerLabel}>Duration</Text>
        <Text style={styles.timerValue}>{formattedTime}</Text>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{dataPointCount.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Data Points</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text style={styles.statValue}>{samplesPerSecond}</Text>
          <Text style={styles.statLabel}>Hz (actual)</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {((dataPointCount * 7 * 8) / 1024).toFixed(1)}
          </Text>
          <Text style={styles.statLabel}>KB (est.)</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  timerDisplay: {
    alignItems: 'center',
  },
  timerLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  timerValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },
});

RecordingTimer.displayName = 'RecordingTimer';
export default RecordingTimer;
