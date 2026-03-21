export const APP_NAME = 'PathSense AI';
export const APP_VERSION = '0.1.0';

export const COLORS = {
  primary: '#1a1a2e',
  secondary: '#16213e',
  accent: '#0f3460',
  highlight: '#e94560',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#ef4444',
  text: '#ffffff',
  textSecondary: '#94a3b8',
  background: '#0f0f1a',
  surface: '#1e1e2e',
  border: '#2d2d3d',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const SENSOR_CONFIG = {
  camera: {
    fps: 15,
    width: 640,
    height: 480,
  },
  imu: {
    sampleRate: 100,
    windowMs: 150,
  },
  gps: {
    minAccuracy: 20,
    maxAge: 2000,
  },
};

export const DISTANCE_THRESHOLDS = {
  near: 1.2,
  medium: 2.5,
};

export const ALERT_MESSAGES = {
  stop: 'Stop',
  stepLeft: 'Step left',
  stepRight: 'Step right',
  keepLeft: 'Keep left',
  keepRight: 'Keep right',
  cautionAhead: 'Caution ahead',
  obstacleAhead: 'Obstacle ahead',
  pathNarrowing: 'Path narrowing',
  lowLight: 'Low light, guidance limited',
  cameraBlocked: 'Camera blocked, adjust phone',
  gpsWeak: 'GPS weak',
};

export const HAPTIC_PATTERNS = {
  stop: { type: 'impactHeavy', duration: 500 },
  left: { type: 'selection', count: 2, interval: 100 },
  right: { type: 'selection', count: 3, interval: 100 },
  caution: { type: 'notificationWarning', duration: 300 },
} as const;

export const VOICE_CONFIG = {
  defaultRate: 0.5,
  defaultPitch: 1.0,
  defaultVolume: 1.0,
  language: 'en-US',
};
