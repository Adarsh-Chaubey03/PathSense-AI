import Twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: Twilio.Twilio | null = null;

const DEMO_MODE = process.env.DEMO_MODE === 'true';
const MAX_SMS_RETRIES = Number(process.env.SMS_MAX_RETRIES ?? 2);

function getClient(): Twilio.Twilio {
  if (!twilioClient) {
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    }
    twilioClient = Twilio(accountSid, authToken);
  }
  return twilioClient;
}

export interface SMSResult {
  success: boolean;
  to: string;
  messageSid?: string;
  error?: string;
}

/**
 * Send SMS using Twilio
 */
export async function sendSMS(to: string, message: string): Promise<SMSResult> {
  if (DEMO_MODE) {
    const demoMessageSid = `DEMO_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[SMS:DEMO_MODE] Simulated send to ${to}`);
    return { success: true, to, messageSid: demoMessageSid };
  }

  if (!twilioPhoneNumber) {
    console.error('[SMS] TWILIO_PHONE_NUMBER not configured');
    return { success: false, to, error: 'Twilio phone number not configured' };
  }

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_SMS_RETRIES; attempt += 1) {
    try {
      const client = getClient();
      const result = await client.messages.create({
        body: message,
        from: twilioPhoneNumber,
        to: to,
      });

      console.log(`[SMS] Sent to ${to}, SID: ${result.sid}, attempt: ${attempt}`);
      return { success: true, to, messageSid: result.sid };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[SMS] Attempt ${attempt} failed for ${to}:`, lastError);
      if (attempt < MAX_SMS_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  return { success: false, to, error: lastError ?? 'Failed to send SMS' };
}

export default { sendSMS };
