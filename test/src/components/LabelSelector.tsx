/**
 * LabelSelector Component - Event type selection for recording
 *
 * Features:
 * - Visual selection of event types
 * - Color-coded labels
 * - Accessible button design
 */

import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { EventLabel } from '../types';
import { COLORS, SPACING, FONT_SIZES, RADIUS, LABEL_DISPLAY_NAMES } from '../constants';
import { getLabelColor } from '../utils';

interface LabelSelectorProps {
  selectedLabel: EventLabel;
  onSelectLabel: (label: EventLabel) => void;
  disabled?: boolean;
}

const LABELS: EventLabel[] = ['phone_drop', 'phone_placed_on_table', 'random_movement'];

export const LabelSelector: React.FC<LabelSelectorProps> = memo(({
  selectedLabel,
  onSelectLabel,
  disabled = false,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Event Type</Text>
      <Text style={styles.subtitle}>Select what you're about to record</Text>

      <View style={styles.labelsContainer}>
        {LABELS.map((label) => {
          const isSelected = selectedLabel === label;
          const labelColor = getLabelColor(label);

          return (
            <TouchableOpacity
              key={label}
              style={[
                styles.labelButton,
                isSelected && styles.labelButtonSelected,
                isSelected && { borderColor: labelColor },
                disabled && styles.labelButtonDisabled,
              ]}
              onPress={() => onSelectLabel(label)}
              disabled={disabled}
              activeOpacity={0.7}
              accessibilityLabel={`Select ${LABEL_DISPLAY_NAMES[label]}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <View
                style={[
                  styles.labelIndicator,
                  { backgroundColor: labelColor },
                  isSelected && styles.labelIndicatorSelected,
                ]}
              />
              <View style={styles.labelTextContainer}>
                <Text
                  style={[
                    styles.labelText,
                    isSelected && styles.labelTextSelected,
                  ]}
                >
                  {LABEL_DISPLAY_NAMES[label]}
                </Text>
                <Text style={styles.labelDescription}>
                  {getLabelDescription(label)}
                </Text>
              </View>
              {isSelected && (
                <View style={[styles.checkmark, { backgroundColor: labelColor }]}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

function getLabelDescription(label: EventLabel): string {
  switch (label) {
    case 'phone_drop':
      return 'Phone falling from hand or pocket';
    case 'phone_placed_on_table':
      return 'Setting phone down on surface';
    case 'random_movement':
      return 'Shaking, walking, or random motion';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  labelsContainer: {
    gap: SPACING.sm,
  },
  labelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: SPACING.md,
  },
  labelButtonSelected: {
    backgroundColor: COLORS.surfaceLight,
  },
  labelButtonDisabled: {
    opacity: 0.5,
  },
  labelIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    opacity: 0.6,
  },
  labelIndicatorSelected: {
    opacity: 1,
  },
  labelTextContainer: {
    flex: 1,
  },
  labelText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  labelTextSelected: {
    color: COLORS.text,
  },
  labelDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
  },
});

LabelSelector.displayName = 'LabelSelector';
export default LabelSelector;
