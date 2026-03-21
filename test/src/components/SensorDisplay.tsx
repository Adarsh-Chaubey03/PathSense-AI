/**
 * SensorDisplay Component - Shows live accelerometer and gyroscope values
 *
 * Displays:
 * - Accelerometer X, Y, Z values
 * - Gyroscope X, Y, Z values
 * - Acceleration magnitude
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AccelerometerData, GyroscopeData } from '../types';
import { COLORS, SPACING, FONT_SIZES, RADIUS } from '../constants';
import { roundTo, calculateMagnitude } from '../utils';

interface SensorDisplayProps {
  accelerometer: AccelerometerData | null;
  gyroscope: GyroscopeData | null;
  showMagnitude?: boolean;
}

const SensorValue: React.FC<{
  label: string;
  value: number | null;
  unit: string;
  color?: string;
}> = ({ label, value, unit, color = COLORS.text }) => (
  <View style={styles.valueRow}>
    <Text style={styles.valueLabel}>{label}:</Text>
    <Text style={[styles.valueNumber, { color }]}>
      {value !== null ? roundTo(value, 3).toFixed(3) : '---'}
    </Text>
    <Text style={styles.valueUnit}>{unit}</Text>
  </View>
);

export const SensorDisplay: React.FC<SensorDisplayProps> = memo(({
  accelerometer,
  gyroscope,
  showMagnitude = true,
}) => {
  const accMagnitude = accelerometer
    ? calculateMagnitude(accelerometer.x, accelerometer.y, accelerometer.z)
    : null;

  return (
    <View style={styles.container}>
      {/* Accelerometer Section */}
      <View style={styles.sensorSection}>
        <View style={styles.sensorHeader}>
          <Text style={styles.sensorTitle}>Accelerometer</Text>
          <Text style={styles.sensorUnit}>m/s²</Text>
        </View>

        <View style={styles.valuesContainer}>
          <SensorValue
            label="X"
            value={accelerometer?.x ?? null}
            unit=""
            color={COLORS.labelPhoneDrop}
          />
          <SensorValue
            label="Y"
            value={accelerometer?.y ?? null}
            unit=""
            color={COLORS.success}
          />
          <SensorValue
            label="Z"
            value={accelerometer?.z ?? null}
            unit=""
            color={COLORS.secondary}
          />
        </View>

        {showMagnitude && (
          <View style={styles.magnitudeRow}>
            <Text style={styles.magnitudeLabel}>|a|</Text>
            <Text style={styles.magnitudeValue}>
              {accMagnitude !== null ? roundTo(accMagnitude, 2).toFixed(2) : '---'}
            </Text>
          </View>
        )}
      </View>

      {/* Gyroscope Section */}
      <View style={styles.sensorSection}>
        <View style={styles.sensorHeader}>
          <Text style={styles.sensorTitle}>Gyroscope</Text>
          <Text style={styles.sensorUnit}>rad/s</Text>
        </View>

        <View style={styles.valuesContainer}>
          <SensorValue
            label="X"
            value={gyroscope?.x ?? null}
            unit=""
            color={COLORS.labelPhoneDrop}
          />
          <SensorValue
            label="Y"
            value={gyroscope?.y ?? null}
            unit=""
            color={COLORS.success}
          />
          <SensorValue
            label="Z"
            value={gyroscope?.z ?? null}
            unit=""
            color={COLORS.secondary}
          />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  sensorSection: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sensorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sensorTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  sensorUnit: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  valuesContainer: {
    gap: SPACING.xs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueLabel: {
    width: 20,
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  valueNumber: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontFamily: 'monospace',
    fontWeight: '600',
    textAlign: 'right',
  },
  valueUnit: {
    width: 30,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginLeft: SPACING.xs,
  },
  magnitudeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  magnitudeLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  magnitudeValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.primary,
    fontFamily: 'monospace',
  },
});

SensorDisplay.displayName = 'SensorDisplay';
export default SensorDisplay;
