/**
 * DatasetList Component - Displays saved datasets with actions
 *
 * Note: Uses map instead of FlatList since this component is typically
 * rendered inside a parent ScrollView to avoid nesting issues.
 */

import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { DatasetFile } from '../types';
import { COLORS, SPACING, FONT_SIZES, RADIUS, LABEL_DISPLAY_NAMES } from '../constants';
import { formatDuration, formatFileSize, getLabelColor } from '../utils';

interface DatasetListProps {
  datasets: DatasetFile[];
  onShare: (filepath: string) => void;
  onDelete: (filepath: string) => void;
  onPreview?: (filepath: string) => void;
}

const DatasetItem: React.FC<{
  dataset: DatasetFile;
  onShare: () => void;
  onDelete: () => void;
  onPreview?: () => void;
}> = ({ dataset, onShare, onDelete, onPreview }) => {
  const labelColor = getLabelColor(dataset.label);

  const handleDelete = () => {
    Alert.alert(
      'Delete Dataset',
      'Are you sure you want to delete this dataset? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  return (
    <View style={styles.itemContainer}>
      {/* Label indicator */}
      <View style={[styles.labelBar, { backgroundColor: labelColor }]} />

      <View style={styles.itemContent}>
        {/* Header */}
        <View style={styles.itemHeader}>
          <Text style={[styles.labelText, { color: labelColor }]}>
            {LABEL_DISPLAY_NAMES[dataset.label] || dataset.label}
          </Text>
          <Text style={styles.timestampText}>
            {new Date(dataset.timestamp).toLocaleString()}
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{dataset.dataPointCount.toLocaleString()}</Text>
            <Text style={styles.statLabel}>points</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatDuration(dataset.durationMs)}</Text>
            <Text style={styles.statLabel}>duration</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatFileSize(dataset.fileSizeBytes)}</Text>
            <Text style={styles.statLabel}>size</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          {onPreview && (
            <TouchableOpacity style={styles.actionButton} onPress={onPreview}>
              <Text style={styles.actionText}>Preview</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionButton} onPress={onShare}>
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={handleDelete}
          >
            <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export const DatasetList: React.FC<DatasetListProps> = memo(({
  datasets,
  onShare,
  onDelete,
  onPreview,
}) => {
  if (datasets.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📊</Text>
        <Text style={styles.emptyText}>No datasets recorded yet</Text>
        <Text style={styles.emptySubtext}>
          Start recording to collect motion data
        </Text>
      </View>
    );
  }

  // Using map instead of FlatList to avoid nested virtualized lists warning
  // when this component is rendered inside a parent ScrollView
  return (
    <View style={styles.listContent}>
      {datasets.map((item) => (
        <DatasetItem
          key={item.filepath}
          dataset={item}
          onShare={() => onShare(item.filepath)}
          onDelete={() => onDelete(item.filepath)}
          onPreview={onPreview ? () => onPreview(item.filepath) : undefined}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  listContent: {
    gap: SPACING.sm,
  },
  itemContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  labelBar: {
    width: 4,
  },
  itemContent: {
    flex: 1,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  timestampText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  actionButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADIUS.md,
  },
  deleteButton: {
    backgroundColor: COLORS.error + '20',
  },
  actionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '500',
  },
  deleteText: {
    color: COLORS.error,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
    gap: SPACING.sm,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});

DatasetList.displayName = 'DatasetList';
export default DatasetList;
