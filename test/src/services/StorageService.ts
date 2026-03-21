/**
 * Storage Service - Manages local file storage for collected datasets
 *
 * This service handles:
 * - Creating and managing the data directory
 * - Saving sensor data to JSON files
 * - Reading and listing saved datasets
 * - Deleting datasets
 * - File size management
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { STORAGE_CONFIG } from '../constants';
import { SensorDataPoint, DatasetFile, EventLabel } from '../types';
import { generateFilename, formatFileSize } from '../utils';

class StorageService {
  // Base directory for all datasets
  private dataDirectory: string;
  private exportDirectory: string;

  constructor() {
    this.dataDirectory = `${FileSystem.documentDirectory}${STORAGE_CONFIG.DATA_DIRECTORY}/`;
    this.exportDirectory = `${this.dataDirectory}exports/`;
  }

  /**
   * Initialize the storage directory
   * Creates the directory if it doesn't exist
   */
  async initialize(): Promise<void> {
    try {
      const directories = [
        { path: this.dataDirectory, label: 'data directory' },
        { path: this.exportDirectory, label: 'export directory' },
      ];

      for (const directory of directories) {
        const dirInfo = await FileSystem.getInfoAsync(directory.path);

        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(directory.path, { intermediates: true });
          console.log(`[StorageService] Created ${directory.label}:`, directory.path);
        } else {
          console.log(`[StorageService] ${directory.label} exists:`, directory.path);
        }
      }
    } catch (error) {
      console.error('[StorageService] Failed to initialize directory:', error);
      throw error;
    }
  }

  /**
   * Save sensor data to a JSON file
   * Returns the metadata of the saved file
   */
  async saveDataset(
    dataPoints: SensorDataPoint[],
    label: EventLabel,
    startTime: number
  ): Promise<DatasetFile> {
    try {
      // Generate filename
      const filename = generateFilename(label, startTime);
      const filepath = `${this.dataDirectory}${filename}`;

      // Calculate duration
      const endTime = dataPoints.length > 0
        ? dataPoints[dataPoints.length - 1].timestamp
        : startTime;
      const durationMs = endTime - startTime;

      // Create dataset object with metadata
      const dataset = {
        metadata: {
          label,
          startTime,
          endTime,
          durationMs,
          dataPointCount: dataPoints.length,
          samplingRateHz: dataPoints.length > 1
            ? Math.round(dataPoints.length / (durationMs / 1000))
            : 0,
          createdAt: new Date().toISOString(),
        },
        data: dataPoints,
      };

      // Convert to JSON string
      const jsonContent = JSON.stringify(dataset, null, 2);

      // Write to file
      await FileSystem.writeAsStringAsync(filepath, jsonContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Get file info for size
      const fileInfo = await FileSystem.getInfoAsync(filepath);
      const fileSizeBytes = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;

      console.log('[StorageService] Saved dataset:', filename, 'Size:', formatFileSize(fileSizeBytes));

      return {
        filename,
        filepath,
        label,
        timestamp: startTime,
        dataPointCount: dataPoints.length,
        durationMs,
        fileSizeBytes,
      };
    } catch (error) {
      console.error('[StorageService] Failed to save dataset:', error);
      throw error;
    }
  }

  /**
   * List all saved dataset files
   */
  async listDatasets(): Promise<DatasetFile[]> {
    try {
      const files = await FileSystem.readDirectoryAsync(this.dataDirectory);
      const jsonFiles = files.filter(f => f.endsWith(STORAGE_CONFIG.FILE_EXTENSION));

      const datasetFiles: DatasetFile[] = [];

      for (const filename of jsonFiles) {
        try {
          const filepath = `${this.dataDirectory}${filename}`;
          const content = await FileSystem.readAsStringAsync(filepath);
          const dataset = JSON.parse(content);
          const fileInfo = await FileSystem.getInfoAsync(filepath);

          datasetFiles.push({
            filename,
            filepath,
            label: dataset.metadata?.label || 'unlabeled',
            timestamp: dataset.metadata?.startTime || 0,
            dataPointCount: dataset.metadata?.dataPointCount || 0,
            durationMs: dataset.metadata?.durationMs || 0,
            fileSizeBytes: fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0,
          });
        } catch (parseError) {
          console.warn('[StorageService] Failed to parse file:', filename, parseError);
        }
      }

      // Sort by timestamp (newest first)
      datasetFiles.sort((a, b) => b.timestamp - a.timestamp);

      return datasetFiles;
    } catch (error) {
      console.error('[StorageService] Failed to list datasets:', error);
      return [];
    }
  }

  /**
   * Read a specific dataset file
   */
  async readDataset(filepath: string): Promise<{
    metadata: any;
    data: SensorDataPoint[];
  } | null> {
    try {
      const content = await FileSystem.readAsStringAsync(filepath);
      return JSON.parse(content);
    } catch (error) {
      console.error('[StorageService] Failed to read dataset:', error);
      return null;
    }
  }

  /**
   * Delete a dataset file
   */
  async deleteDataset(filepath: string): Promise<boolean> {
    try {
      await FileSystem.deleteAsync(filepath);
      console.log('[StorageService] Deleted dataset:', filepath);
      return true;
    } catch (error) {
      console.error('[StorageService] Failed to delete dataset:', error);
      return false;
    }
  }

  /**
   * Delete all datasets
   */
  async deleteAllDatasets(): Promise<boolean> {
    try {
      await FileSystem.deleteAsync(this.dataDirectory, { idempotent: true });
      await this.initialize(); // Recreate the directory
      console.log('[StorageService] Deleted all datasets');
      return true;
    } catch (error) {
      console.error('[StorageService] Failed to delete all datasets:', error);
      return false;
    }
  }

  /**
   * Get total storage usage
   */
  async getStorageUsage(): Promise<{ totalFiles: number; totalBytes: number }> {
    try {
      const datasets = await this.listDatasets();
      const totalBytes = datasets.reduce((sum, d) => sum + d.fileSizeBytes, 0);
      return {
        totalFiles: datasets.length,
        totalBytes,
      };
    } catch (error) {
      console.error('[StorageService] Failed to get storage usage:', error);
      return { totalFiles: 0, totalBytes: 0 };
    }
  }

  /**
   * Share a dataset file
   */
  async shareDataset(filepath: string): Promise<boolean> {
    return this.shareFile(filepath, 'application/json', 'Share IMU Dataset');
  }

  /**
   * Share any exported file
   */
  async shareFile(
    filepath: string,
    mimeType: string = 'application/octet-stream',
    dialogTitle: string = 'Share file'
  ): Promise<boolean> {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        console.warn('[StorageService] Sharing is not available on this device');
        return false;
      }

      await Sharing.shareAsync(filepath, {
        mimeType,
        dialogTitle,
      });

      return true;
    } catch (error) {
      console.error('[StorageService] Failed to share file:', error);
      return false;
    }
  }

  /**
   * Export all datasets as a combined JSON file
   */
  async exportAllDatasets(): Promise<string | null> {
    try {
      const datasets = await this.listDatasets();
      const allData: SensorDataPoint[] = [];

      for (const dataset of datasets) {
        const content = await this.readDataset(dataset.filepath);
        if (content?.data) {
          allData.push(...content.data);
        }
      }

      const exportFilename = `all_datasets_${Date.now()}.json`;
      const exportPath = `${this.exportDirectory}${exportFilename}`;

      await FileSystem.writeAsStringAsync(
        exportPath,
        JSON.stringify(allData, null, 2),
        { encoding: FileSystem.EncodingType.UTF8 }
      );

      return exportPath;
    } catch (error) {
      console.error('[StorageService] Failed to export all datasets:', error);
      return null;
    }
  }

  /**
   * Export all datasets as a model-friendly CSV file
   */
  async exportAllDatasetsAsCsv(): Promise<string | null> {
    try {
      const datasets = await this.listDatasets();
      const rows: string[] = [
        'timestamp,acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z,label',
      ];

      for (const dataset of datasets) {
        const content = await this.readDataset(dataset.filepath);
        if (!content?.data) continue;

        for (const point of content.data) {
          rows.push(
            [
              point.timestamp,
              point.acc_x,
              point.acc_y,
              point.acc_z,
              point.gyro_x,
              point.gyro_y,
              point.gyro_z,
              point.label,
            ].join(',')
          );
        }
      }

      const exportFilename = `all_datasets_${Date.now()}.csv`;
      const exportPath = `${this.exportDirectory}${exportFilename}`;

      await FileSystem.writeAsStringAsync(
        exportPath,
        rows.join('\n'),
        { encoding: FileSystem.EncodingType.UTF8 }
      );

      return exportPath;
    } catch (error) {
      console.error('[StorageService] Failed to export datasets as CSV:', error);
      return null;
    }
  }

  /**
   * Get the data directory path
   */
  getDataDirectory(): string {
    return this.dataDirectory;
  }

  getExportDirectory(): string {
    return this.exportDirectory;
  }
}

// Export singleton instance
export const storageService = new StorageService();
export default StorageService;
