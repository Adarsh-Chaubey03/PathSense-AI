/**
 * HomeScreen - Main screen for IMU data collection
 *
 * This is the primary interface for:
 * - Viewing live sensor data
 * - Selecting event labels
 * - Starting/stopping recordings
 * - Managing recorded datasets
 * - Previewing and uploading data
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { SensorDisplay } from '../components/SensorDisplay';
import { RecordingControls } from '../components/RecordingControls';
import { LabelSelector } from '../components/LabelSelector';
import { RecordingTimer } from '../components/RecordingTimer';
import { StatusIndicator } from '../components/StatusIndicator';
import { DatasetList } from '../components/DatasetList';
import { DataPreview } from '../components/DataPreview';

import { useSensors } from '../hooks/useSensors';
import { useRecording } from '../hooks/useRecording';
import { storageService } from '../services/StorageService';
import { permissionService } from '../services/PermissionService';
import { uploadService } from '../services/UploadService';

import { DatasetFile } from '../types';
import { COLORS, SPACING, FONT_SIZES, RADIUS } from '../constants';

export const HomeScreen: React.FC = () => {
  // Sensor state
  const {
    accelerometer,
    gyroscope,
    isAvailable: sensorsAvailable,
    subscribe: subscribeSensors,
    unsubscribe: unsubscribeSensors,
  } = useSensors();

  // Recording state
  const {
    recordingState,
    startRecording,
    stopRecording,
    setLabel,
    error: recordingError,
  } = useRecording();

  // Dataset list state
  const [datasets, setDatasets] = useState<DatasetFile[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [showLiveSensors, setShowLiveSensors] = useState(true);

  // Preview modal state
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewFilepath, setPreviewFilepath] = useState<string | null>(null);

  // Upload modal state
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [apiUrl, setApiUrl] = useState('https://api.example.com/datasets');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });

  // Initialize app
  useEffect(() => {
    const initialize = async () => {
      try {
        // Check permissions and show explanation
        const shouldProceed = await permissionService.showPermissionExplanation();

        if (shouldProceed) {
          const status = await permissionService.requestPermissions();

          if (!status.sensorsAvailable) {
            permissionService.showSettingsDialog();
          }
        }

        setPermissionChecked(true);

        // Initialize storage
        await storageService.initialize();

        // Load existing datasets
        await loadDatasets();

        // Subscribe to sensors for live display
        subscribeSensors();
      } catch (error) {
        console.error('Initialization error:', error);
        Alert.alert('Error', 'Failed to initialize the app. Please restart.');
      }
    };

    initialize();

    // Cleanup on unmount
    return () => {
      unsubscribeSensors();
    };
  }, []);

  // Load datasets from storage
  const loadDatasets = useCallback(async () => {
    try {
      const files = await storageService.listDatasets();
      setDatasets(files);
    } catch (error) {
      console.error('Failed to load datasets:', error);
    }
  }, []);

  // Handle pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadDatasets();
    setIsRefreshing(false);
  }, [loadDatasets]);

  // Handle recording start
  const handleStartRecording = useCallback(() => {
    // Unsubscribe from live display sensors first
    unsubscribeSensors();

    // Start recording (which will subscribe with data callback)
    startRecording();
  }, [startRecording, unsubscribeSensors]);

  // Handle recording stop
  const handleStopRecording = useCallback(async () => {
    const savedFile = await stopRecording();

    // Re-subscribe for live display
    subscribeSensors();

    if (savedFile) {
      // Reload datasets to show the new file
      await loadDatasets();

      Alert.alert(
        'Recording Saved',
        `Saved ${savedFile.dataPointCount.toLocaleString()} data points to ${savedFile.filename}`,
        [{ text: 'OK' }]
      );
    }
  }, [stopRecording, subscribeSensors, loadDatasets]);

  // Handle dataset share
  const handleShareDataset = useCallback(async (filepath: string) => {
    const success = await storageService.shareDataset(filepath);
    if (!success) {
      Alert.alert('Error', 'Failed to share dataset');
    }
  }, []);

  // Handle dataset delete
  const handleDeleteDataset = useCallback(async (filepath: string) => {
    const success = await storageService.deleteDataset(filepath);
    if (success) {
      await loadDatasets();
    } else {
      Alert.alert('Error', 'Failed to delete dataset');
    }
  }, [loadDatasets]);

  // Handle dataset preview
  const handlePreviewDataset = useCallback((filepath: string) => {
    setPreviewFilepath(filepath);
    setPreviewVisible(true);
  }, []);

  // Close preview modal
  const handleClosePreview = useCallback(() => {
    setPreviewVisible(false);
    setPreviewFilepath(null);
  }, []);

  // Perform the actual upload
  const performUpload = useCallback(async () => {
    setIsUploading(true);
    setUploadProgress({ completed: 0, total: datasets.length });

    try {
      // Set the API URL
      uploadService.setApiUrl(apiUrl);

      // Upload all datasets
      const result = await uploadService.uploadAllDatasets((completed, total) => {
        setUploadProgress({ completed, total });
      });

      setIsUploading(false);
      setUploadModalVisible(false);

      Alert.alert(
        'Upload Complete',
        `Successfully uploaded: ${result.successful}\nFailed: ${result.failed}`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      setIsUploading(false);
      Alert.alert('Upload Error', 'Failed to upload datasets. Check your connection and try again.');
    }
  }, [apiUrl, datasets.length]);

  // Handle upload all datasets
  const handleUploadDatasets = useCallback(() => {
    if (datasets.length === 0) {
      Alert.alert('No Data', 'No datasets available to upload.');
      return;
    }

    // Confirm upload
    Alert.alert(
      'Upload Datasets',
      `Upload ${datasets.length} dataset(s) to server?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upload',
          onPress: performUpload,
        },
      ]
    );
  }, [datasets.length, performUpload]);

  const handleExportAllJson = useCallback(async () => {
    if (datasets.length === 0) {
      Alert.alert('No Data', 'No datasets available to export.');
      return;
    }

    const exportPath = await storageService.exportAllDatasets();
    if (!exportPath) {
      Alert.alert('Export Failed', 'Could not create the combined JSON dataset file.');
      return;
    }

    const shared = await storageService.shareFile(
      exportPath,
      'application/json',
      'Export all IMU datasets as JSON'
    );

    if (!shared) {
      Alert.alert(
        'Export Created',
        `Combined JSON dataset created at:\n${exportPath}`
      );
    }
  }, [datasets.length]);

  const handleExportAllCsv = useCallback(async () => {
    if (datasets.length === 0) {
      Alert.alert('No Data', 'No datasets available to export.');
      return;
    }

    const exportPath = await storageService.exportAllDatasetsAsCsv();
    if (!exportPath) {
      Alert.alert('Export Failed', 'Could not create the combined CSV dataset file.');
      return;
    }

    const shared = await storageService.shareFile(
      exportPath,
      'text/csv',
      'Export all IMU datasets as CSV'
    );

    if (!shared) {
      Alert.alert(
        'Export Created',
        `Combined CSV dataset created at:\n${exportPath}`
      );
    }
  }, [datasets.length]);

  // Calculate total storage usage
  const totalDataPoints = datasets.reduce((sum, d) => sum + d.dataPointCount, 0);
  const totalSize = datasets.reduce((sum, d) => sum + d.fileSizeBytes, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="light" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>IMU Dataset Collector</Text>
          <StatusIndicator
            sensorsAvailable={sensorsAvailable}
            isRecording={recordingState.isRecording}
          />
        </View>

        {/* Live Sensor Display */}
        {showLiveSensors && !recordingState.isRecording && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Live Sensor Data</Text>
            <SensorDisplay
              accelerometer={accelerometer}
              gyroscope={gyroscope}
              showMagnitude={true}
            />
          </View>
        )}

        {/* Recording Timer (shown during recording) */}
        {recordingState.isRecording && (
          <View style={styles.section}>
            <RecordingTimer
              elapsedTime={recordingState.elapsedTime}
              dataPointCount={recordingState.dataPointCount}
              isRecording={recordingState.isRecording}
            />
          </View>
        )}

        {/* Label Selector */}
        <View style={styles.section}>
          <LabelSelector
            selectedLabel={recordingState.currentLabel}
            onSelectLabel={setLabel}
            disabled={recordingState.isRecording}
          />
        </View>

        {/* Recording Controls */}
        <View style={styles.section}>
          <RecordingControls
            isRecording={recordingState.isRecording}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            disabled={!sensorsAvailable}
          />
        </View>

        {/* Error display */}
        {recordingError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{recordingError}</Text>
          </View>
        )}

        {/* Saved Datasets */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Saved Datasets</Text>
            <Text style={styles.sectionBadge}>{datasets.length}</Text>
          </View>

          {/* Dataset summary stats */}
          {datasets.length > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>
                {totalDataPoints.toLocaleString()} total points | {(totalSize / 1024).toFixed(1)} KB
              </Text>
            </View>
          )}

          <DatasetList
            datasets={datasets}
            onShare={handleShareDataset}
            onDelete={handleDeleteDataset}
            onPreview={handlePreviewDataset}
          />

          {/* Export and upload actions */}
          {datasets.length > 0 && (
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity
                style={[styles.actionButtonLarge, styles.secondaryActionButton]}
                onPress={handleExportAllJson}
              >
                <Text style={styles.secondaryActionButtonText}>Export All JSON</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButtonLarge, styles.secondaryActionButton]}
                onPress={handleExportAllCsv}
              >
                <Text style={styles.secondaryActionButtonText}>Export All CSV</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButtonLarge, styles.primaryActionButton]}
                onPress={() => setUploadModalVisible(true)}
              >
                <Text style={styles.primaryActionButtonText}>Upload All Datasets</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Data Preview Modal */}
      <DataPreview
        visible={previewVisible}
        filepath={previewFilepath}
        onClose={handleClosePreview}
      />

      {/* Upload Configuration Modal */}
      <Modal
        visible={uploadModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setUploadModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.uploadModal}>
            <Text style={styles.modalTitle}>Upload Configuration</Text>

            <Text style={styles.inputLabel}>API Endpoint URL</Text>
            <TextInput
              style={styles.urlInput}
              value={apiUrl}
              onChangeText={setApiUrl}
              placeholder="https://api.example.com/datasets"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Text style={styles.uploadInfo}>
              {datasets.length} dataset(s) will be uploaded
            </Text>

            {isUploading && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${uploadProgress.total > 0 ? (uploadProgress.completed / uploadProgress.total) * 100 : 0}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {uploadProgress.completed} / {uploadProgress.total}
                </Text>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setUploadModalVisible(false)}
                disabled={isUploading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, isUploading && styles.buttonDisabled]}
                onPress={handleUploadDatasets}
                disabled={isUploading}
              >
                <Text style={styles.confirmButtonText}>
                  {isUploading ? 'Uploading...' : 'Upload'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  sectionBadge: {
    backgroundColor: COLORS.primary,
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  summaryRow: {
    marginBottom: SPACING.sm,
  },
  summaryText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  errorContainer: {
    backgroundColor: COLORS.error + '20',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.error + '50',
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    textAlign: 'center',
  },
  actionButtonsContainer: {
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  actionButtonLarge: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  primaryActionButton: {
    backgroundColor: COLORS.primary,
  },
  secondaryActionButton: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  primaryActionButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  secondaryActionButtonText: {
    color: COLORS.secondary,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  uploadModal: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  urlInput: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  uploadInfo: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  progressContainer: {
    marginBottom: SPACING.lg,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: SPACING.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default HomeScreen;
