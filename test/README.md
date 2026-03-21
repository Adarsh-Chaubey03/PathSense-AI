# IMU Dataset Collection App

A production-quality React Native (Expo) application for collecting real-world IMU sensor datasets for fall detection research.

## Features

- **High-Frequency Sensor Sampling**: Captures accelerometer and gyroscope data at 50-100 Hz
- **Synchronized Timestamps**: Both sensors share synchronized millisecond timestamps
- **Event Labeling**: Label recordings as:
  - Phone Drop
  - Phone Placed on Table
  - Random Movement / Spikes
- **Live Sensor Display**: Real-time visualization of sensor values
- **Recording Timer**: Shows elapsed time and data point count
- **Local Storage**: Saves datasets as structured JSON files
- **Dataset Management**: View, share, preview, and delete recorded datasets
- **Data Preview**: View statistics and sample data points before upload
- **Dataset Upload**: Upload datasets to a configurable backend API
- **Haptic Feedback**: Vibration feedback when recording starts/stops

## Data Format

Each recording is saved as a JSON file with the following structure:

```json
{
  "metadata": {
    "label": "phone_drop",
    "startTime": 1710000000000,
    "endTime": 1710000005000,
    "durationMs": 5000,
    "dataPointCount": 500,
    "samplingRateHz": 100,
    "createdAt": "2024-03-21T12:00:00.000Z"
  },
  "data": [
    {
      "timestamp": 1710000000000,
      "acc_x": 0.12,
      "acc_y": -9.81,
      "acc_z": 0.45,
      "gyro_x": 0.02,
      "gyro_y": 0.01,
      "gyro_z": 0.03,
      "label": "phone_drop"
    }
  ]
}
```

### Field Descriptions

| Field | Description | Unit |
|-------|-------------|------|
| timestamp | Unix timestamp | milliseconds |
| acc_x, acc_y, acc_z | Accelerometer axes | m/s² |
| gyro_x, gyro_y, gyro_z | Gyroscope axes | rad/s |
| label | Event classification | string |

## Setup Instructions

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Expo Go app on your mobile device
- iOS or Android device (real device recommended for accurate sensor data)

### Installation

1. Navigate to the project directory:
   ```bash
   cd real_world_dataset_collection_app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Expo development server:
   ```bash
   npx expo start
   ```

4. Scan the QR code with Expo Go (Android) or Camera app (iOS)

### Running on Device

For best results, use a **real physical device**. Emulators typically don't provide real sensor data.

```bash
# Start with tunnel (useful for devices on different networks)
npx expo start --tunnel

# Start for Android specifically
npx expo start --android

# Start for iOS specifically
npx expo start --ios
```

## Project Structure

```
real_world_dataset_collection_app/
├── App.tsx                    # Main entry point
├── app.json                   # Expo configuration
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript configuration
├── babel.config.js            # Babel configuration
├── assets/                    # App icons and splash screens
└── src/
    ├── components/            # UI components
    │   ├── index.ts           # Component exports
    │   ├── SensorDisplay.tsx  # Live sensor values
    │   ├── RecordingControls.tsx
    │   ├── LabelSelector.tsx
    │   ├── RecordingTimer.tsx
    │   ├── StatusIndicator.tsx
    │   ├── DatasetList.tsx
    │   └── DataPreview.tsx    # Dataset preview modal
    ├── screens/               # App screens
    │   └── HomeScreen.tsx
    ├── hooks/                 # Custom React hooks
    │   ├── index.ts
    │   ├── useSensors.ts
    │   └── useRecording.ts
    ├── services/              # Business logic
    │   ├── index.ts
    │   ├── SensorService.ts   # Sensor management
    │   ├── StorageService.ts  # File storage
    │   ├── PermissionService.ts
    │   └── UploadService.ts   # Backend API upload
    ├── types/                 # TypeScript definitions
    │   └── index.ts
    ├── constants/             # App constants
    │   └── index.ts
    └── utils/                 # Utility functions
        └── index.ts
```

## Usage Guide

### Recording Data

1. **Select Event Type**: Choose what you're about to record:
   - Phone Drop: Simulating a phone falling
   - Phone Placed on Table: Setting the phone down
   - Random Movement: Shaking or general movement

2. **Start Recording**: Tap the "Start Recording" button
   - A timer will show elapsed time
   - Data point counter displays samples collected

3. **Perform the Action**: Execute the movement you selected

4. **Stop Recording**: Tap "Stop Recording" to save the data

### Managing Datasets

- **View**: See list of all saved recordings with metadata
- **Preview**: View statistics (min/max/avg) and sample data points
- **Share**: Export individual datasets via system share sheet
- **Delete**: Remove unwanted recordings
- **Upload**: Upload all datasets to a configurable backend API

### Uploading Data

1. Record some datasets
2. Tap "Upload All Datasets" button
3. Configure your API endpoint URL
4. Confirm and monitor upload progress

### File Location

Datasets are stored in the app's document directory:
```
{APP_DOCUMENTS}/imu_datasets/
```

File naming format: `{label}_{timestamp}.json`

Example: `phone_drop_2024-03-21_12-00-00.json`

## Technical Details

### Sampling Configuration

- **Target Rate**: 100 Hz (10ms interval)
- **Minimum Interval**: 8ms
- **Synchronization Window**: 50ms
- **Buffer Size**: 5000 data points

### Sensor Details

**Accelerometer**
- Measures linear acceleration
- Unit: m/s² (meters per second squared)
- Includes gravity component (~9.81 m/s² on Z-axis when flat)

**Gyroscope**
- Measures rotational velocity
- Unit: rad/s (radians per second)

### Data Integrity

- Duplicate timestamp prevention
- Sensor data synchronization
- Proper subscription cleanup
- Buffered writes for efficiency

## Dependencies

| Package | Purpose |
|---------|---------|
| expo | Expo SDK framework |
| expo-sensors | Accelerometer & Gyroscope access |
| expo-file-system | Local file storage |
| expo-sharing | File sharing |
| expo-haptics | Vibration feedback |
| react-native-safe-area-context | Safe area handling |

## Contributing

This app is designed for collecting high-quality "false fall" data (phone drops, table placements, random movements) to improve fall detection model accuracy beyond 95%.

## License

MIT
