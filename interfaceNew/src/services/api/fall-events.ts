import { apiRequest } from "@/src/services/api/client";
import type {
  MotionState,
  SensorSample,
  SensorVector,
} from "@/src/services/sensors/sensor-adapter";
import type { RawSensorDataPoint } from "@/src/services/sensors/sensor-window-store";

export type FallStatus = "CONFIRMED" | "REJECTED" | "UNCERTAIN";

export interface FallDispatchSummary {
  attempted: boolean;
  success: boolean;
  recipientsTotal: number;
  recipientsSucceeded: number;
}

export interface SensorWindowPayload {
  samples: RawSensorDataPoint[];
  windowStartMs: number;
  windowEndMs: number;
  sampleCount: number;
}

export interface FallEventRequest {
  eventId: string;
  timestampMs: number;
  motionState: MotionState;
  accelerometer: SensorVector;
  gyroscope: SensorVector;
  accelMagnitude: number;
  gyroMagnitude: number;
  sampleRateHz: number;
  source: "real" | "mock";
  snapshot: SensorSample[];
  motionScore: number;
  orientationChange: boolean;
  transcript?: string;
  sensorWindow?: SensorWindowPayload;
}

export interface FallEventResponse {
  status: FallStatus;
  sosTriggered: boolean;
  dispatch?: FallDispatchSummary;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export type FallDetectResult = "REAL_FALL" | "FALSE_ALARM" | "NO_FALL";

export interface FallDetectResponse {
  fall_prob: number;
  false_prob: number;
  result: FallDetectResult;
  decision_reason?: string;
}

export interface FallDetectRequest {
  window: number[][];
  sampleCount?: number;
  sampleRateHz?: number;
  windowStartMs?: number;
  windowEndMs?: number;
  segment?: {
    rearPre: number;
    core: number;
    post: number;
    total: number;
  };
}

export async function postFallEvent(
  payload: FallEventRequest,
): Promise<FallEventResponse> {
  return apiRequest<FallEventResponse>("/fall-event", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>("/health", { method: "GET" });
}

export async function postFallDetect(
  payload: FallDetectRequest | number[][],
): Promise<FallDetectResponse> {
  const requestPayload = Array.isArray(payload) ? { window: payload } : payload;

  // Canonical FE fall-decision endpoint: /fall-detect
  return apiRequest<FallDetectResponse>("/fall-detect", {
    method: "POST",
    body: JSON.stringify(requestPayload),
  });
}

export async function postFallDetectWithRetry(
  payload: FallDetectRequest | number[][],
): Promise<FallDetectResponse | null> {
  try {
    return await postFallDetect(payload);
  } catch {
    try {
      return await postFallDetect(payload);
    } catch {
      return null;
    }
  }
}
