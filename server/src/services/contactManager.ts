/**
 * Contact Manager Module
 * Handles emergency contact alerts for PathSense-AI
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sendSMS, type SMSResult } from './smsService.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '../data/contacts.json');

interface Contact {
  name: string;
  phone: string;
}

interface AlertResult {
  contact: Contact;
  smsResult: SMSResult;
}

export type AlertTarget = 'CONTACTS' | 'EMERGENCY';

interface AlertDispatchOptions {
  target: AlertTarget;
  locationLink: string;
}

/**
 * Fetch emergency contacts from storage
 */
function getContacts(): Contact[] {
  if (!existsSync(DATA_FILE)) {
    console.warn('[ContactManager] No contacts file found at:', DATA_FILE);
    return [];
  }

  try {
    const data = readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data) as Contact[];
  } catch (err) {
    console.error('[ContactManager] Failed to read contacts:', err);
    return [];
  }
}

/**
 * Send emergency alert to all contacts via SMS
 */
export async function send_alert_to_contacts(message: string): Promise<AlertResult[]> {
  const contacts = getContacts();

  if (contacts.length === 0) {
    console.warn('[ContactManager] No emergency contacts configured');
    return [];
  }

  console.log(`[ContactManager] Sending SOS to ${contacts.length} contact(s)`);

  const results: AlertResult[] = [];

  for (const contact of contacts) {
    console.log(`[ContactManager] Alerting ${contact.name} (${contact.phone})`);
    const smsResult = await sendSMS(contact.phone, message);

    results.push({ contact, smsResult });

    if (smsResult.success) {
      console.log(`[ContactManager] SMS sent to ${contact.name}`);
    } else {
      console.error(`[ContactManager] SMS failed for ${contact.name}: ${smsResult.error}`);
    }
  }

  const successCount = results.filter(r => r.smsResult.success).length;
  console.log(`[ContactManager] Alert complete: ${successCount}/${contacts.length} SMS sent`);

  return results;
}

function getEmergencyPhoneNumber(contacts: Contact[]): string | undefined {
  const markedEmergencyContact = contacts.find(
    (contact) => (contact as Contact & { isEmergency?: boolean }).isEmergency === true,
  );

  if (markedEmergencyContact?.phone) {
    return markedEmergencyContact.phone;
  }

  const envEmergencyNumber = process.env.EMERGENCY_PHONE_NUMBER?.trim();
  if (envEmergencyNumber && envEmergencyNumber.length > 0) {
    return envEmergencyNumber;
  }

  return '108';
}

function buildMessageWithLocation(message: string, locationLink: string): string {
  return `${message}\nLocation: ${locationLink}`;
}

export async function send_alert_by_priority(
  message: string,
  options: AlertDispatchOptions,
): Promise<AlertResult[]> {
  const contacts = getContacts();
  const smsBody = buildMessageWithLocation(message, options.locationLink);
  const results: AlertResult[] = [];

  if (options.target === 'CONTACTS') {
    if (contacts.length === 0) {
      console.warn('[ContactManager] CONTACTS action requested but no contacts configured');
      return [];
    }

    for (const contact of contacts) {
      const smsResult = await sendSMS(contact.phone, smsBody);
      results.push({ contact, smsResult });
    }

    return results;
  }

  // EMERGENCY target: all contacts + emergency number fallback/override.
  const emergencyNumber = getEmergencyPhoneNumber(contacts);
  const recipientsByPhone = new Map<string, Contact>();

  for (const contact of contacts) {
    recipientsByPhone.set(contact.phone, contact);
  }

  if (emergencyNumber) {
    recipientsByPhone.set(emergencyNumber, {
      name: 'Emergency Services',
      phone: emergencyNumber,
    });
  }

  if (recipientsByPhone.size === 0) {
    console.warn('[ContactManager] EMERGENCY action requested but no recipients configured');
    return [];
  }

  for (const recipient of recipientsByPhone.values()) {
    const smsResult = await sendSMS(recipient.phone, smsBody);
    results.push({ contact: recipient, smsResult });
  }

  return results;
}

export default {
  send_alert_by_priority,
  send_alert_to_contacts,
  getContacts,
};
