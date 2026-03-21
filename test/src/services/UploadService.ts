/**
 * Upload Service - Handles dataset upload to backend API
 *
 * This service provides:
 * - Single file upload to backend
 * - Batch upload of multiple datasets
 * - Upload progress tracking
 * - Error handling and retry logic
 */

import { readAsStringAsync, uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { SensorDataPoint, UploadResponse, DatasetFile } from '../types';
import { storageService } from './StorageService';

// Default API endpoint (can be configured)
const DEFAULT_API_URL = 'https://api.example.com/datasets';

class UploadService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = DEFAULT_API_URL;
  }

  /**
   * Configure the API endpoint URL
   */
  setApiUrl(url: string): void {
    this.apiUrl = url;
    console.log('[UploadService] API URL set to:', url);
  }

  /**
   * Get current API URL
   */
  getApiUrl(): string {
    return this.apiUrl;
  }

  /**
   * Upload a single dataset file to the backend
   */
  async uploadDataset(
    filepath: string,
    onProgress?: (progress: number) => void
  ): Promise<UploadResponse> {
    try {
      // Read the file content
      const content = await readAsStringAsync(filepath);
      const dataset = JSON.parse(content);

      // Prepare the upload payload
      const payload = {
        metadata: dataset.metadata,
        data: dataset.data,
        uploadedAt: new Date().toISOString(),
        deviceInfo: {
          platform: 'expo',
          timestamp: Date.now(),
        },
      };

      // Simulate progress for demo (real implementation would use uploadAsync with progress)
      if (onProgress) {
        onProgress(0.1);
      }

      // Make the API request
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (onProgress) {
        onProgress(0.9);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (onProgress) {
        onProgress(1.0);
      }

      console.log('[UploadService] Upload successful:', result);

      return {
        success: true,
        message: 'Dataset uploaded successfully',
        fileId: result.id || result.fileId,
      };
    } catch (error) {
      console.error('[UploadService] Upload error:', error);

      // Handle network errors gracefully
      if (error instanceof TypeError && error.message.includes('Network')) {
        return {
          success: false,
          message: 'Network error. Please check your internet connection.',
        };
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  /**
   * Upload multiple datasets in batch
   */
  async uploadMultipleDatasets(
    filepaths: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ successful: number; failed: number; results: UploadResponse[] }> {
    const results: UploadResponse[] = [];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < filepaths.length; i++) {
      const filepath = filepaths[i];

      try {
        const result = await this.uploadDataset(filepath);
        results.push(result);

        if (result.success) {
          successful++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        results.push({
          success: false,
          message: `Failed to upload ${filepath}`,
        });
      }

      if (onProgress) {
        onProgress(i + 1, filepaths.length);
      }
    }

    console.log('[UploadService] Batch upload complete:', { successful, failed });

    return { successful, failed, results };
  }

  /**
   * Upload all stored datasets
   */
  async uploadAllDatasets(
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ successful: number; failed: number; results: UploadResponse[] }> {
    const datasets = await storageService.listDatasets();
    const filepaths = datasets.map(d => d.filepath);

    return this.uploadMultipleDatasets(filepaths, onProgress);
  }

  /**
   * Test the API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'HEAD',
        headers: {
          'Accept': 'application/json',
        },
      });

      return response.ok || response.status === 405; // 405 = Method not allowed (but server is reachable)
    } catch (error) {
      console.error('[UploadService] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Upload dataset as FormData (alternative method for file upload)
   */
  async uploadAsFormData(
    filepath: string,
    filename: string
  ): Promise<UploadResponse> {
    try {
      const uploadResult = await uploadAsync(
        this.apiUrl,
        filepath,
        {
          fieldName: 'file',
          httpMethod: 'POST',
          uploadType: FileSystemUploadType.MULTIPART,
          parameters: {
            filename,
            uploadedAt: new Date().toISOString(),
          },
        }
      );

      if (uploadResult.status >= 200 && uploadResult.status < 300) {
        const response = JSON.parse(uploadResult.body);
        return {
          success: true,
          message: 'Dataset uploaded successfully',
          fileId: response.id || response.fileId,
        };
      }

      return {
        success: false,
        message: `Upload failed with status ${uploadResult.status}`,
      };
    } catch (error) {
      console.error('[UploadService] FormData upload error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }
}

// Export singleton instance
export const uploadService = new UploadService();
export default UploadService;
