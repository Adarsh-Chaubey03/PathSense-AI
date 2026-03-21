import Twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: Twilio.Twilio | null = null;

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
  if (!twilioPhoneNumber) {
    console.error('[SMS] TWILIO_PHONE_NUMBER not configured');
    return { success: false, to, error: 'Twilio phone number not configured' };
  }

  try {
    const client = getClient();
    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: to,
    });

    console.log(`[SMS] Sent to ${to}, SID: ${result.sid}`);
    return { success: true, to, messageSid: result.sid };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[SMS] Failed to send to ${to}:`, errorMessage);
    return { success: false, to, error: errorMessage };
  }
}

export default { sendSMS };
