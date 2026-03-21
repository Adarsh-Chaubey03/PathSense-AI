import type { SensorSample } from "@/src/services/sensors/sensor-adapter";
import {
  sensorWindowStore,
  type RawSensorDataPoint,
} from "@/src/services/sensors/sensor-window-store";

/**
 * Edge AI Fall Detection Filter
 *
 * Performs physics-based filtering on sensor data to minimize unnecessary
 * backend API calls. Only escalates high-confidence fall patterns.
 */

export type EdgeDecision = "CALL_API" | "IGNORE";

export interface EdgeFilterResult {
  decision: EdgeDecision;
  reason: string;
  windowStats?: WindowStats;
  sensorData?: RawSensorDataPoint[];
}

export interface WindowStats {
  minAccG: number;
  maxAccG: number;
  maxGyro: number;
  sampleCount: number;
}

// Configuration constants
const WINDOW_SIZE = 20;
const COOLDOWN_MS = 3000;
const GRAVITY_EARTH = 9.81;

// Fall detection thresholds (in g for acceleration, rad/s for gyroscope)
const FREE_FALL_THRESHOLD = 0.5;
const IMPACT_THRESHOLD = 2.5;
const ROTATION_THRESHOLD = 2.5;

interface SlidingWindowSample {
  accMagG: number;
  gyroMag: number;
  timestampMs: number;
}

class EdgeFallFilter {
  private window: SlidingWindowSample[] = [];
  private lastApiCallTimestamp: number = 0;

  private toGUnits(accelMagnitudeMps2: number): number {
    return accelMagnitudeMps2 / GRAVITY_EARTH;
  }

  /**
   * Process an incoming sensor sample and decide whether to call the API
   */
  evaluate(sample: SensorSample): EdgeFilterResult {
    const accMagG = this.toGUnits(sample.accelMagnitude);
    const gyroMag = sample.gyroMagnitude;

    // Store raw sensor data in the 2-second window
    sensorWindowStore.addSample(
      sample.accelerometer.x,
      sample.accelerometer.y,
      sample.accelerometer.z,
      sample.gyroscope.x,
      sample.gyroscope.y,
      sample.gyroscope.z,
    );

    // Add sample to sliding window for fall detection
    this.window.push({
      accMagG,
      gyroMag,
      timestampMs: sample.timestampMs,
    });

    // Maintain window size
    if (this.window.length > WINDOW_SIZE) {
      this.window.shift();
    }

    // Not enough samples yet
    if (this.window.length < WINDOW_SIZE) {
      return {
        decision: "IGNORE",
        reason: `Collecting samples (${this.window.length}/${WINDOW_SIZE})`,
      };
    }

    // Check cooldown
    const now = Date.now();
    if (now - this.lastApiCallTimestamp < COOLDOWN_MS) {
      const remainingMs = COOLDOWN_MS - (now - this.lastApiCallTimestamp);
      return {
        decision: "IGNORE",
        reason: `Cooldown active (${Math.ceil(remainingMs / 1000)}s remaining)`,
      };
    }

    // Compute window statistics
    const stats = this.computeWindowStats();

    // Apply fall detection conditions
    const hasFreefall = stats.minAccG < FREE_FALL_THRESHOLD;
    const hasImpact = stats.maxAccG > IMPACT_THRESHOLD;
    const hasRotation = stats.maxGyro > ROTATION_THRESHOLD;

    // All three conditions must be met
    if (hasFreefall && hasImpact && hasRotation) {
      this.lastApiCallTimestamp = now;

      // Get the raw sensor data for API call
      const sensorData = sensorWindowStore.getSamplesForApi();

      this.clearWindow();

      return {
        decision: "CALL_API",
        reason: `Fall detected: freefall(${stats.minAccG.toFixed(2)}g) + impact(${stats.maxAccG.toFixed(2)}g) + rotation(${stats.maxGyro.toFixed(2)} rad/s)`,
        windowStats: stats,
        sensorData,
      };
    }

    // Build reason for IGNORE
    const missing: string[] = [];
    if (!hasFreefall) {
      missing.push(`no freefall (min=${stats.minAccG.toFixed(2)}g)`);
    }
    if (!hasImpact) {
      missing.push(`no impact (max=${stats.maxAccG.toFixed(2)}g)`);
    }
    if (!hasRotation) {
      missing.push(`no rotation (max=${stats.maxGyro.toFixed(2)} rad/s)`);
    }

    return {
      decision: "IGNORE",
      reason: missing.join("; "),
      windowStats: stats,
    };
  }

  private computeWindowStats(): WindowStats {
    let minAccG = Infinity;
    let maxAccG = -Infinity;
    let maxGyro = -Infinity;

    for (const sample of this.window) {
      if (sample.accMagG < minAccG) minAccG = sample.accMagG;
      if (sample.accMagG > maxAccG) maxAccG = sample.accMagG;
      if (sample.gyroMag > maxGyro) maxGyro = sample.gyroMag;
    }

    return {
      minAccG,
      maxAccG,
      maxGyro,
      sampleCount: this.window.length,
    };
  }

  clearWindow(): void {
    this.window = [];
  }

  reset(): void {
    this.window = [];
    this.lastApiCallTimestamp = 0;
    sensorWindowStore.clear();
  }

  getWindowStats(): WindowStats | null {
    if (this.window.length === 0) return null;
    return this.computeWindowStats();
  }

  isInCooldown(): boolean {
    return Date.now() - this.lastApiCallTimestamp < COOLDOWN_MS;
  }

  getCooldownRemainingMs(): number {
    const elapsed = Date.now() - this.lastApiCallTimestamp;
    return Math.max(0, COOLDOWN_MS - elapsed);
  }
}

// Singleton instance
export const edgeFallFilter = new EdgeFallFilter();

// Re-export types
export type { RawSensorDataPoint, SensorWindowData } from "@/src/services/sensors/sensor-window-store";
export { sensorWindowStore } from "@/src/services/sensors/sensor-window-store";
