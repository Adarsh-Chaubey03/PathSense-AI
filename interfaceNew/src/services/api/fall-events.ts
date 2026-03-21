import { apiRequest } from "@/src/services/api/client";

export type FallStatus = "CONFIRMED" | "REJECTED" | "UNCERTAIN";

export interface FallEventRequest {
  motionScore: number;
  orientationChange: boolean;
  transcript?: string;
}

export interface FallEventResponse {
  status: FallStatus;
  sosTriggered: boolean;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
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

export async function getContacts(): Promise<EmergencyContact[]> {
  return apiRequest<EmergencyContact[]>("/contacts", { method: "GET" });
}

export async function sendContactAlert(message: string): Promise<{
  message: string;
  recipients: (EmergencyContact & { status: "sent" })[];
}> {
  return apiRequest("/contacts/alert", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}
