import type { SensorSample } from "@/src/services/sensors/sensor-adapter";

export interface DetectionDecision {
  shouldEscalateCandidate: boolean;
  reason: string;
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
