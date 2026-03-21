import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {COLORS, SPACING, FONT_SIZES} from '../constants';

interface StatusIndicatorProps {
  label: string;
  value: number;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({label, value}) => {
  const getStatusColor = (val: number): string => {
    if (val >= 0.8) return COLORS.success;
    if (val >= 0.5) return COLORS.warning;
    return COLORS.error;
  };

  const getStatusText = (val: number): string => {
    if (val >= 0.8) return 'Good';
    if (val >= 0.5) return 'Weak';
    return 'Poor';
  };

  const percentage = Math.round(value * 100);
  const statusColor = getStatusColor(value);

  return (
    <View
      style={styles.container}
      accessibilityLabel={`${label} quality: ${getStatusText(value)}, ${percentage}%`}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.barContainer}>
        <View
          style={[
            styles.barFill,
            {width: `${percentage}%`, backgroundColor: statusColor},
          ]}
        />
      </View>
      <Text style={[styles.status, {color: statusColor}]}>
        {getStatusText(value)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    minWidth: 80,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  barContainer: {
    width: 60,
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  status: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    marginTop: SPACING.xs,
  },
});

export default StatusIndicator;
