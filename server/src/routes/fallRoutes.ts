import { Router } from "express";
import type { Request, Response } from "express";
import type { FallEventRequest, FallEventResponse } from "../types/fall.ts";
import { handleFallEvent } from "../services/validationService.ts";
import { getRecentFallEvents } from "../services/fallEventStore.ts";

const router = Router();

const MOTION_STATES = new Set([
  "stationary",
  "walking",
  "turning",
  "shaking",
  "unstable",
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSensorVector(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { x?: unknown; y?: unknown; z?: unknown };
  return (
    isFiniteNumber(candidate.x) &&
    isFiniteNumber(candidate.y) &&
    isFiniteNumber(candidate.z)
  );
}

function isMotionState(
  value: unknown,
): value is FallEventRequest["motionState"] {
  return typeof value === "string" && MOTION_STATES.has(value);
}

function formatNumeric(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : "NaN";
}

/**
 * POST /fall-event
 *
 * Processes a potential fall event from sensor data.
 *
 * Request body:
 * {
 *   "motionScore": number,       // Required: motion stability score (0-1)
 *   "orientationChange": boolean, // Required: whether device orientation changed
 *   "transcript": string          // Optional: user's voice response transcript
 * }
 *
 * Response:
 * {
 *   "status": "CONFIRMED" | "REJECTED" | "UNCERTAIN",
 *   "sosTriggered": boolean
 * }
 */
router.post(
  "/fall-event",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        eventId,
        timestampMs,
        motionState,
        accelerometer,
        gyroscope,
        accelMagnitude,
        gyroMagnitude,
        sampleRateHz,
        source,
        snapshot,
        motionScore,
        orientationChange,
        transcript,
      } = req.body;

      if (typeof eventId !== "string" || eventId.trim().length === 0) {
        res.status(400).json({
          error: "Invalid request: eventId must be a non-empty string",
        });
        return;
      }

      if (!isFiniteNumber(timestampMs)) {
        res.status(400).json({
          error: "Invalid request: timestampMs must be a number",
        });
        return;
      }

      if (!isMotionState(motionState)) {
        res.status(400).json({
          error: "Invalid request: motionState is invalid",
        });
        return;
      }

      if (!isSensorVector(accelerometer) || !isSensorVector(gyroscope)) {
        res.status(400).json({
          error:
            "Invalid request: accelerometer and gyroscope must be xyz vectors",
        });
        return;
      }

      if (!isFiniteNumber(accelMagnitude) || !isFiniteNumber(gyroMagnitude)) {
        res.status(400).json({
          error:
            "Invalid request: accelMagnitude and gyroMagnitude must be numbers",
        });
        return;
      }

      if (!isFiniteNumber(sampleRateHz) || sampleRateHz <= 0) {
        res.status(400).json({
          error: "Invalid request: sampleRateHz must be a positive number",
        });
        return;
      }

      if (source !== "real" && source !== "mock") {
        res.status(400).json({
          error: "Invalid request: source must be either real or mock",
        });
        return;
      }

      if (!Array.isArray(snapshot) || snapshot.length === 0) {
        res.status(400).json({
          error: "Invalid request: snapshot must be a non-empty array",
        });
        return;
      }

      // Validate required fields
      if (typeof motionScore !== "number") {
        res.status(400).json({
          error: "Invalid request: motionScore must be a number",
        });
        return;
      }

      if (typeof orientationChange !== "boolean") {
        res.status(400).json({
          error: "Invalid request: orientationChange must be a boolean",
        });
        return;
      }

      // Validate motionScore range
      if (motionScore < 0 || motionScore > 1) {
        res.status(400).json({
          error: "Invalid request: motionScore must be between 0 and 1",
        });
        return;
      }

      // Validate transcript if provided
      if (transcript !== undefined && typeof transcript !== "string") {
        res.status(400).json({
          error: "Invalid request: transcript must be a string if provided",
        });
        return;
      }

      const request: FallEventRequest = {
        eventId,
        timestampMs,
        motionState,
        accelerometer,
        gyroscope,
        accelMagnitude,
        gyroMagnitude,
        sampleRateHz,
        source,
        snapshot,
        motionScore,
        orientationChange,
        transcript,
      };

      const firstSnapshot = snapshot[0] as {
        accelerometer?: { x?: number; y?: number; z?: number };
        gyroscope?: { x?: number; y?: number; z?: number };
      };
      const lastSnapshot = snapshot[snapshot.length - 1] as {
        accelerometer?: { x?: number; y?: number; z?: number };
        gyroscope?: { x?: number; y?: number; z?: number };
      };

      console.log("[FallEvent] Incoming sensor vectors", {
        eventId,
        source,
        sampleRateHz,
        accelMagnitude: formatNumeric(accelMagnitude),
        gyroMagnitude: formatNumeric(gyroMagnitude),
        accelerometer: {
          x: formatNumeric(accelerometer.x),
          y: formatNumeric(accelerometer.y),
          z: formatNumeric(accelerometer.z),
        },
        gyroscope: {
          x: formatNumeric(gyroscope.x),
          y: formatNumeric(gyroscope.y),
          z: formatNumeric(gyroscope.z),
        },
        snapshotCount: snapshot.length,
        snapshotFirst:
          firstSnapshot?.accelerometer && firstSnapshot?.gyroscope
            ? {
                accelerometer: {
                  x: formatNumeric(firstSnapshot.accelerometer.x ?? NaN),
                  y: formatNumeric(firstSnapshot.accelerometer.y ?? NaN),
                  z: formatNumeric(firstSnapshot.accelerometer.z ?? NaN),
                },
                gyroscope: {
                  x: formatNumeric(firstSnapshot.gyroscope.x ?? NaN),
                  y: formatNumeric(firstSnapshot.gyroscope.y ?? NaN),
                  z: formatNumeric(firstSnapshot.gyroscope.z ?? NaN),
                },
              }
            : null,
        snapshotLast:
          lastSnapshot?.accelerometer && lastSnapshot?.gyroscope
            ? {
                accelerometer: {
                  x: formatNumeric(lastSnapshot.accelerometer.x ?? NaN),
                  y: formatNumeric(lastSnapshot.accelerometer.y ?? NaN),
                  z: formatNumeric(lastSnapshot.accelerometer.z ?? NaN),
                },
                gyroscope: {
                  x: formatNumeric(lastSnapshot.gyroscope.x ?? NaN),
                  y: formatNumeric(lastSnapshot.gyroscope.y ?? NaN),
                  z: formatNumeric(lastSnapshot.gyroscope.z ?? NaN),
                },
              }
            : null,
      });

      const response: FallEventResponse = await handleFallEvent(request);

      res.status(200).json(response);
    } catch (error) {
      console.error("[FallRoutes] Error processing fall event:", error);
      res.status(500).json({
        error: "Internal server error while processing fall event",
      });
    }
  },
);

router.get("/fall-events/recent", (req: Request, res: Response): void => {
  const rawLimit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 25;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 25;
  const events = getRecentFallEvents(limit);
  res.status(200).json({
    count: events.length,
    events,
  });
});

export default router;
