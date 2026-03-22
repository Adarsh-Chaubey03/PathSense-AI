import type { SensorSample } from "@/src/services/sensors/sensor-adapter";
import {
  edgeFallFilter,
  getEdgeFilterThresholds,
  type EdgeFilterResult,
  type WindowStats,
} from "./edge-filter";

export interface DetectionDecision {
  shouldEscalateCandidate: boolean;
  reason: string;
  edgeDecision?: "CALL_API" | "IGNORE";
  windowStats?: WindowStats;
}

const FALL_MOTION_THRESHOLD = 0.22;
const BED_LIKE_ACCELERATION_MIN = 8.8;
const BED_LIKE_ACCELERATION_MAX = 10.8;
const SHAKING_GYRO_THRESHOLD = 2.0;
const IMPACT_ACCELERATION_THRESHOLD = 12.2;

export function evaluateCandidate(sample: SensorSample | null): DetectionDecision {
  if (!sample) {
    return {
      shouldEscalateCandidate: false,
      reason: "No sensor sample available yet; waiting for stable data.",
    };
  }

  if (
    sample.motionState === "stationary" &&
    sample.accelMagnitude >= BED_LIKE_ACCELERATION_MIN &&
    sample.accelMagnitude <= BED_LIKE_ACCELERATION_MAX &&
    sample.gyroMagnitude < 0.2
  ) {
    return {
      shouldEscalateCandidate: false,
      reason: "Stationary low-rotation profile detected (likely pocket/bed placement).",
    };
  }

  if (
    sample.motionState === "shaking" &&
    sample.gyroMagnitude > SHAKING_GYRO_THRESHOLD &&
    sample.accelMagnitude < IMPACT_ACCELERATION_THRESHOLD
  ) {
    return {
      shouldEscalateCandidate: false,
      reason: "High rotation without hard impact (likely random shake).",
    };
  }

  if (!sample.orientationChange) {
    return {
      shouldEscalateCandidate: false,
      reason: "No orientation change detected (likely normal shake/movement).",
    };
  }

  if (sample.motionScore > FALL_MOTION_THRESHOLD) {
    return {
      shouldEscalateCandidate: false,
      reason: "Motion profile suggests non-fall activity (possible shake/bed movement).",
    };
  }

  if (sample.accelMagnitude < IMPACT_ACCELERATION_THRESHOLD) {
    return {
      shouldEscalateCandidate: false,
      reason: "No significant impact magnitude detected.",
    };
  }

  return {
    shouldEscalateCandidate: true,
    reason: "Impact + orientation change profile is consistent with a possible fall.",
  };
}

/**
 * Primary fall detection using edge AI filter with sliding window analysis.
 */
export function evaluateWithEdgeFilter(sample: SensorSample): DetectionDecision {
  const edgeResult: EdgeFilterResult = edgeFallFilter.evaluate(sample);

  return {
    shouldEscalateCandidate: edgeResult.decision === "CALL_API",
    reason: edgeResult.reason,
    edgeDecision: edgeResult.decision,
    windowStats: edgeResult.windowStats,
  };
}

/**
 * Reset the edge filter
 */
export function resetEdgeFilter(): void {
  edgeFallFilter.reset();
}

/**
 * Check if edge filter is in cooldown period
 */
export function isEdgeFilterInCooldown(): boolean {
  return edgeFallFilter.isInCooldown();
}

/**
 * Get remaining cooldown time in milliseconds
 */
export function getEdgeFilterCooldownMs(): number {
  return edgeFallFilter.getCooldownRemainingMs();
}

export { getEdgeFilterThresholds };
