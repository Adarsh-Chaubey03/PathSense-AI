import type { SensorSample } from "@/src/services/sensors/sensor-adapter";

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
}

export interface WindowStats {
  minAccG: number;
  maxAccG: number;
  maxGyro: number;
  sampleCount: number;
}

// Configuration constants
const WINDOW_SIZE = 30;
const GRAVITY_EARTH = 9.81;

// Fall-range constraints for spike-triggered confirmation.
const IMPACT_ACCEL_THRESHOLD = 2.7;
const FREEFALL_ACCEL_THRESHOLD = 0.7;
const ROTATION_THRESHOLD = 2.6;
const DYNAMIC_RANGE_THRESHOLD = 1.8;
const HIGH_IMPACT_OVERRIDE_THRESHOLD = 3.0;
const MIN_FALL_SEQUENCE_MS = 120;
const MAX_FALL_SEQUENCE_MS = 1200;
const IMPACT_CONTEXT_RADIUS_SAMPLES = 6;

interface SlidingWindowSample {
  accMagG: number;
  gyroMag: number;
  timestampMs: number;
}

class EdgeFallFilter {
  private window: SlidingWindowSample[] = [];

  private toGUnits(accelMagnitudeMps2: number): number {
    return accelMagnitudeMps2 / GRAVITY_EARTH;
  }

  /**
   * Process an incoming sensor sample and decide whether to call the API
   */
  evaluate(sample: SensorSample): EdgeFilterResult {
    const accMagG = this.toGUnits(sample.accelMagnitude);
    const gyroMag = sample.gyroMagnitude;

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

    // Compute window statistics for UI/debugging
    const stats = this.computeWindowStats();

    let minIdx = 0;
    let maxIdx = 0;
    for (let i = 1; i < this.window.length; i += 1) {
      if (this.window[i].accMagG < this.window[minIdx].accMagG) {
        minIdx = i;
      }
      if (this.window[i].accMagG > this.window[maxIdx].accMagG) {
        maxIdx = i;
      }
    }

    const sequenceDeltaMs =
      this.window[maxIdx].timestampMs - this.window[minIdx].timestampMs;
    const hasValidSequence =
      minIdx < maxIdx &&
      sequenceDeltaMs >= MIN_FALL_SEQUENCE_MS &&
      sequenceDeltaMs <= MAX_FALL_SEQUENCE_MS;

    const hasImpact = stats.maxAccG > IMPACT_ACCEL_THRESHOLD;
    const hasFreefall = stats.minAccG < FREEFALL_ACCEL_THRESHOLD;
    const hasDynamicSwing = stats.maxAccG - stats.minAccG > DYNAMIC_RANGE_THRESHOLD;

    const contextStart = Math.max(0, maxIdx - IMPACT_CONTEXT_RADIUS_SAMPLES);
    const contextEnd = Math.min(this.window.length - 1, maxIdx + IMPACT_CONTEXT_RADIUS_SAMPLES);
    let hasRotationNearImpact = false;
    for (let i = contextStart; i <= contextEnd; i += 1) {
      if (this.window[i].gyroMag > ROTATION_THRESHOLD) {
        hasRotationNearImpact = true;
        break;
      }
    }
    const hasHighImpactOverride = stats.maxAccG > HIGH_IMPACT_OVERRIDE_THRESHOLD;

    // Trigger only for fall-like sequences (freefall -> impact in valid time window)
    // plus either strong rotational context or very high impact.
    if (
      hasImpact &&
      hasFreefall &&
      hasDynamicSwing &&
      hasValidSequence &&
      (hasRotationNearImpact || hasHighImpactOverride)
    ) {
      this.clearWindow();

      return {
        decision: "CALL_API",
        reason: `Fall sequence: min(${stats.minAccG.toFixed(2)}g)->impact(${stats.maxAccG.toFixed(2)}g) in ${Math.round(sequenceDeltaMs)}ms, gyro(${stats.maxGyro.toFixed(2)} rad/s)`,
        windowStats: stats,
      };
    }

    // Build reason for IGNORE
    const missing: string[] = [];
    if (!hasImpact) {
      missing.push(`no impact (max=${stats.maxAccG.toFixed(2)}g)`);
    }
    if (!hasDynamicSwing) {
      missing.push(`no swing (range=${(stats.maxAccG - stats.minAccG).toFixed(2)}g)`);
    }
    if (!hasFreefall) {
      missing.push(`no freefall (min=${stats.minAccG.toFixed(2)}g)`);
    }
    if (!hasValidSequence) {
      missing.push(`no fall sequence (delta=${Math.round(sequenceDeltaMs)}ms)`);
    }
    if (!hasRotationNearImpact && !hasHighImpactOverride) {
      missing.push(
        `no impact context (gyro=${stats.maxGyro.toFixed(2)} rad/s, impact=${stats.maxAccG.toFixed(2)}g)`,
      );
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
  }

  getWindowStats(): WindowStats | null {
    if (this.window.length === 0) return null;
    return this.computeWindowStats();
  }

  isInCooldown(): boolean {
    return false;
  }

  getCooldownRemainingMs(): number {
    return 0;
  }
}

// Singleton instance
export const edgeFallFilter = new EdgeFallFilter();

