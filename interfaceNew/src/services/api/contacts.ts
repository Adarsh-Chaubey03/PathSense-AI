import { apiRequest } from "@/src/services/api/client";

export interface EmergencyContact {
  name: string;
  phone: string;
}

export interface ContactAlertResponse {
  message: string;
  success: boolean;
  recipients: (EmergencyContact & { status: "sent" | "failed"; error?: string })[];
}

export interface ContactCallResponse {
  message: string;
  success: boolean;
  recipient: EmergencyContact;
  callSid?: string;
  error?: string;
}

export async function fetchContacts(): Promise<EmergencyContact[]> {
  return apiRequest<EmergencyContact[]>("/contacts", { method: "GET" });
}

export async function addContact(
  name: string,
  phone: string,
): Promise<EmergencyContact> {
  return apiRequest<EmergencyContact>("/contacts", {
    method: "POST",
    body: JSON.stringify({ name, phone }),
  });
}

export async function removeContact(phone: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/contacts/${encodeURIComponent(phone)}`, {
    method: "DELETE",
  });
}

export async function sendEmergencyAlert(
  message: string,
): Promise<ContactAlertResponse> {
  return apiRequest<ContactAlertResponse>("/contacts/alert", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function placeEmergencyCall(
  spokenMessage?: string,
): Promise<ContactCallResponse> {
  return apiRequest<ContactCallResponse>("/contacts/call", {
    method: "POST",
    body: JSON.stringify(
      spokenMessage ? { spokenMessage } : {},
    ),
  });
}
