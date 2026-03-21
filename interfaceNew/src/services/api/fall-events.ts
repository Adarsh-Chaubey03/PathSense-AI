import { apiRequest } from "@/src/services/api/client";
import type {
  MotionState,
  SensorSample,
  SensorVector,
} from "@/src/services/sensors/sensor-adapter";

export type FallStatus = "CONFIRMED" | "REJECTED" | "UNCERTAIN";

export interface FallDispatchSummary {
  attempted: boolean;
  success: boolean;
  recipientsTotal: number;
  recipientsSucceeded: number;
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
