/**
 * DataPreview Component - Modal to preview collected sensor data
 *
 * Features:
 * - Shows metadata (label, duration, sample count)
 * - Displays sample of first and last readings
 * - Calculates basic statistics (min, max, avg)
 */

import React, { memo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SensorDataPoint } from '../types';
import { storageService } from '../services/StorageService';
import { COLORS, SPACING, FONT_SIZES, RADIUS, LABEL_DISPLAY_NAMES } from '../constants';
import { formatDuration, roundTo } from '../utils';

interface DataPreviewProps {
  visible: boolean;
  filepath: string | null;
  onClose: () => void;
}

interface DataStats {
  accX: { min: number; max: number; avg: number };
  accY: { min: number; max: number; avg: number };
  accZ: { min: number; max: number; avg: number };
  gyroX: { min: number; max: number; avg: number };
  gyroY: { min: number; max: number; avg: number };
  gyroZ: { min: number; max: number; avg: number };
}

function calculateStats(data: SensorDataPoint[]): DataStats {
  const initStat = { min: Infinity, max: -Infinity, sum: 0 };
  const stats = {
    accX: { ...initStat },
    accY: { ...initStat },
    accZ: { ...initStat },
    gyroX: { ...initStat },
    gyroY: { ...initStat },
    gyroZ: { ...initStat },
  };

  for (const point of data) {
    stats.accX.min = Math.min(stats.accX.min, point.acc_x);
    stats.accX.max = Math.max(stats.accX.max, point.acc_x);
    stats.accX.sum += point.acc_x;

    stats.accY.min = Math.min(stats.accY.min, point.acc_y);
    stats.accY.max = Math.max(stats.accY.max, point.acc_y);
    stats.accY.sum += point.acc_y;

    stats.accZ.min = Math.min(stats.accZ.min, point.acc_z);
    stats.accZ.max = Math.max(stats.accZ.max, point.acc_z);
    stats.accZ.sum += point.acc_z;

    stats.gyroX.min = Math.min(stats.gyroX.min, point.gyro_x);
    stats.gyroX.max = Math.max(stats.gyroX.max, point.gyro_x);
    stats.gyroX.sum += point.gyro_x;

    stats.gyroY.min = Math.min(stats.gyroY.min, point.gyro_y);
    stats.gyroY.max = Math.max(stats.gyroY.max, point.gyro_y);
    stats.gyroY.sum += point.gyro_y;

    stats.gyroZ.min = Math.min(stats.gyroZ.min, point.gyro_z);
    stats.gyroZ.max = Math.max(stats.gyroZ.max, point.gyro_z);
    stats.gyroZ.sum += point.gyro_z;
  }

  const count = data.length || 1;
  return {
    accX: { min: stats.accX.min, max: stats.accX.max, avg: stats.accX.sum / count },
    accY: { min: stats.accY.min, max: stats.accY.max, avg: stats.accY.sum / count },
    accZ: { min: stats.accZ.min, max: stats.accZ.max, avg: stats.accZ.sum / count },
    gyroX: { min: stats.gyroX.min, max: stats.gyroX.max, avg: stats.gyroX.sum / count },
    gyroY: { min: stats.gyroY.min, max: stats.gyroY.max, avg: stats.gyroY.sum / count },
    gyroZ: { min: stats.gyroZ.min, max: stats.gyroZ.max, avg: stats.gyroZ.sum / count },
  };
}

const StatRow: React.FC<{
  label: string;
  stats: { min: number; max: number; avg: number };
  color: string;
}> = ({ label, stats, color }) => (
  <View style={styles.statRow}>
    <Text style={[styles.statLabel, { color }]}>{label}</Text>
    <Text style={styles.statValue}>{roundTo(stats.min, 3)}</Text>
    <Text style={styles.statValue}>{roundTo(stats.max, 3)}</Text>
    <Text style={styles.statValue}>{roundTo(stats.avg, 3)}</Text>
  </View>
);

export const DataPreview: React.FC<DataPreviewProps> = memo(({
  visible,
  filepath,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const [data, setData] = useState<SensorDataPoint[]>([]);
  const [stats, setStats] = useState<DataStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && filepath) {
      loadData();
    } else {
      // Reset state when modal closes
      setMetadata(null);
      setData([]);
      setStats(null);
      setError(null);
    }
  }, [visible, filepath]);

  const loadData = async () => {
    if (!filepath) return;

    setLoading(true);
    setError(null);

    try {
      const result = await storageService.readDataset(filepath);
      if (result) {
        setMetadata(result.metadata);
        setData(result.data);
        setStats(calculateStats(result.data));
      } else {
        setError('Failed to load dataset');
      }
    } catch (err) {
      setError('Error reading dataset file');
      console.error('DataPreview load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderSampleData = () => {
    if (data.length === 0) return null;

    const samples = [
      { label: 'First', point: data[0] },
      { label: 'Middle', point: data[Math.floor(data.length / 2)] },
      { label: 'Last', point: data[data.length - 1] },
    ];

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sample Data Points</Text>
        {samples.map(({ label, point }) => (
          <View key={label} style={styles.sampleRow}>
            <Text style={styles.sampleLabel}>{label}</Text>
            <Text style={styles.sampleData}>
              a:[{roundTo(point.acc_x, 2)}, {roundTo(point.acc_y, 2)}, {roundTo(point.acc_z, 2)}]
              {' '}g:[{roundTo(point.gyro_x, 2)}, {roundTo(point.gyro_y, 2)}, {roundTo(point.gyro_z, 2)}]
            </Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Data Preview</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>X</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading data...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Metadata Section */}
              {metadata && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Metadata</Text>
                  <View style={styles.metadataGrid}>
                    <View style={styles.metadataItem}>
                      <Text style={styles.metadataLabel}>Label</Text>
                      <Text style={styles.metadataValue}>
                        {LABEL_DISPLAY_NAMES[metadata.label] || metadata.label}
                      </Text>
                    </View>
                    <View style={styles.metadataItem}>
                      <Text style={styles.metadataLabel}>Duration</Text>
                      <Text style={styles.metadataValue}>
                        {formatDuration(metadata.durationMs)}
                      </Text>
                    </View>
                    <View style={styles.metadataItem}>
                      <Text style={styles.metadataLabel}>Data Points</Text>
                      <Text style={styles.metadataValue}>
                        {metadata.dataPointCount?.toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.metadataItem}>
                      <Text style={styles.metadataLabel}>Sample Rate</Text>
                      <Text style={styles.metadataValue}>
                        {metadata.samplingRateHz} Hz
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Statistics Section */}
              {stats && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Statistics</Text>
                  <View style={styles.statsTable}>
                    {/* Header */}
                    <View style={styles.statsHeader}>
                      <Text style={styles.statsHeaderCell}>Axis</Text>
                      <Text style={styles.statsHeaderCell}>Min</Text>
                      <Text style={styles.statsHeaderCell}>Max</Text>
                      <Text style={styles.statsHeaderCell}>Avg</Text>
                    </View>

                    {/* Accelerometer stats */}
                    <Text style={styles.statsGroupTitle}>Accelerometer (m/s²)</Text>
                    <StatRow label="X" stats={stats.accX} color={COLORS.labelPhoneDrop} />
                    <StatRow label="Y" stats={stats.accY} color={COLORS.success} />
                    <StatRow label="Z" stats={stats.accZ} color={COLORS.secondary} />

                    {/* Gyroscope stats */}
                    <Text style={styles.statsGroupTitle}>Gyroscope (rad/s)</Text>
                    <StatRow label="X" stats={stats.gyroX} color={COLORS.labelPhoneDrop} />
                    <StatRow label="Y" stats={stats.gyroY} color={COLORS.success} />
                    <StatRow label="Z" stats={stats.gyroZ} color={COLORS.secondary} />
                  </View>
                </View>
              )}

              {/* Sample Data Section */}
              {renderSampleData()}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '85%',
    minHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  errorText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.error,
    textAlign: 'center',
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  metadataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  metadataItem: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    minWidth: '48%',
    flex: 1,
  },
  metadataLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  metadataValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  statsTable: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  statsHeader: {
    flexDirection: 'row',
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  statsHeaderCell: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  statsGroupTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  statRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  statLabel: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  statValue: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  sampleRow: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  sampleLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  sampleData: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    fontFamily: 'monospace',
  },
});

DataPreview.displayName = 'DataPreview';
export default DataPreview;
