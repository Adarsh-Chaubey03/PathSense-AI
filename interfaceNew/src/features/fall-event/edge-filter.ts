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
const DEG_TO_RAD = Math.PI / 180;

// Strict profile from false_data non-fall range (p99 based)
const ACC_TRIGGER_THRESHOLD_G = 2.8715650886500868;
const GYRO_TRIGGER_THRESHOLD_RAD_S = 231.82142772108378 * DEG_TO_RAD;
const ACC_RELEASE_THRESHOLD_G = 2.354683372693071;
const GYRO_RELEASE_THRESHOLD_RAD_S = 190.09357073128868 * DEG_TO_RAD;
const MIN_ABOVE_TRIGGER_MS = 60;
const RELEASE_HOLD_MS = 250;
const COOLDOWN_MS = 1200;

interface SlidingWindowSample {
  accMagG: number;
  gyroMag: number;
  timestampMs: number;
}

class EdgeFallFilter {
  private window: SlidingWindowSample[] = [];
  private thresholdStartMs: number | null = null;
  private releaseStartMs: number | null = null;
  private cooldownUntilMs = 0;
  private candidateActive = false;

  private toGUnits(accelMagnitudeMps2: number): number {
    return accelMagnitudeMps2 / GRAVITY_EARTH;
  }

  /**
   * Process an incoming sensor sample and decide whether to call the API
   */
  evaluate(sample: SensorSample): EdgeFilterResult {
    const now = sample.timestampMs;

    if (now < this.cooldownUntilMs) {
      return {
        decision: "IGNORE",
        reason: `Cooldown active (${this.getCooldownRemainingMs()}ms remaining)`,
      };
    }

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

    const aboveTrigger =
      accMagG >= ACC_TRIGGER_THRESHOLD_G &&
      gyroMag >= GYRO_TRIGGER_THRESHOLD_RAD_S;

    if (aboveTrigger) {
      this.releaseStartMs = null;

      if (this.thresholdStartMs === null) {
        this.thresholdStartMs = now;
      }

      const aboveDurationMs = now - this.thresholdStartMs;

      if (aboveDurationMs >= MIN_ABOVE_TRIGGER_MS) {
        this.candidateActive = true;
      }
    } else {
      this.thresholdStartMs = null;
    }

    if (this.candidateActive) {
      const belowRelease =
        accMagG <= ACC_RELEASE_THRESHOLD_G &&
        gyroMag <= GYRO_RELEASE_THRESHOLD_RAD_S;

      if (belowRelease) {
        if (this.releaseStartMs === null) {
          this.releaseStartMs = now;
        }

        const belowDurationMs = now - this.releaseStartMs;
        if (belowDurationMs >= RELEASE_HOLD_MS) {
          this.candidateActive = false;
          this.thresholdStartMs = null;
          this.releaseStartMs = null;
        }
      } else {
        this.releaseStartMs = null;
      }
    }

    if (this.candidateActive) {
      this.cooldownUntilMs = now + COOLDOWN_MS;
      this.candidateActive = false;
      this.thresholdStartMs = null;
      this.releaseStartMs = null;
      this.clearWindow();

      return {
        decision: "CALL_API",
        reason: `Outside stable false-range: acc=${accMagG.toFixed(2)}g, gyro=${gyroMag.toFixed(2)}rad/s`,
        windowStats: stats,
      };
    }

    const missing: string[] = [
      `acc<${ACC_TRIGGER_THRESHOLD_G.toFixed(2)}g or gyro<${GYRO_TRIGGER_THRESHOLD_RAD_S.toFixed(2)}rad/s`,
    ];

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
    this.thresholdStartMs = null;
    this.releaseStartMs = null;
    this.cooldownUntilMs = 0;
    this.candidateActive = false;
  }

  getWindowStats(): WindowStats | null {
    if (this.window.length === 0) return null;
    return this.computeWindowStats();
  }

  isInCooldown(): boolean {
    return Date.now() < this.cooldownUntilMs;
  }

  getCooldownRemainingMs(): number {
    return Math.max(0, this.cooldownUntilMs - Date.now());
  }
}

// Singleton instance
export const edgeFallFilter = new EdgeFallFilter();
