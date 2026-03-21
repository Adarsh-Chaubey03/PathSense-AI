# PathSense AI - React Native Interface

Mobile interface for the PathSense AI assistive navigation system.

## Setup

```bash
# Install dependencies
npm install

# iOS setup
cd ios && pod install && cd ..

# Start Metro bundler
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios
```

## Project Structure

```
interface/
├── App.tsx                 # Main app component
├── index.js                # Entry point
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
├── babel.config.js         # Babel config
├── metro.config.js         # Metro bundler config
├── app.json                # App configuration
└── src/
    ├── navigation/         # Navigation setup
    │   └── AppNavigator.tsx
    ├── screens/            # App screens
    │   ├── HomeScreen.tsx
    │   ├── NavigationScreen.tsx
    │   └── SettingsScreen.tsx
    ├── components/         # Reusable components
    │   ├── StatusIndicator.tsx
    │   ├── HapticFeedback.ts
    │   └── VoiceOutput.ts
    ├── services/           # Core services
    │   ├── SensorService.ts
    │   ├── GPSService.ts
    │   ├── CameraService.ts
    │   └── FeedbackService.ts
    ├── hooks/              # Custom hooks
    │   └── useSensors.ts
    ├── types/              # TypeScript types
    │   └── index.ts
    ├── constants/          # App constants
    │   └── index.ts
    └── assets/             # Static assets
```

## Features

- **Camera-based obstacle detection** (requires ML model integration)
- **IMU sensor tracking** for motion state detection
- **GPS integration** for location awareness
- **Voice guidance** via text-to-speech
- **Haptic feedback** patterns for alerts
- **Accessibility-first design** with proper labels and announcements

## Permissions Required

### iOS
- Camera access
- Location (when in use)
- Motion data

### Android
- Camera
- Fine/Coarse location
- Vibrate
- High sampling rate sensors
