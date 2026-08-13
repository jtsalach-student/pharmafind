import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

export type SmsResult = { status: 'SENT' | 'FAILED'; providerRef?: string };

// Twilio SDK
let twilio: any = null;
if (env.SMS_PROVIDER === 'TWILIO' && env.TWILIO_ACCOUNT_SID) {
  try {
    const TwilioModule = await import('twilio');
    twilio = TwilioModule.default(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  } catch (error) {
    console.error('[SMS] Failed to initialize Twilio:', error);
  }
}

/**
 * Send SMS via Twilio
 */
const sendViaTwilio = async (to: string, message: string): Promise<SmsResult> => {
  try {
    if (!twilio || !env.TWILIO_FROM_NUMBER) {
      throw new Error('Twilio not configured');
    }

    // Ensure phone number is in E.164 format
    const formattedPhone = to.startsWith('+') ? to : `+${to}`;

    const result = await twilio.messages.create({
      body: message,
      from: env.TWILIO_FROM_NUMBER,
      to: formattedPhone
    });

    console.info('[SMS] Sent via Twilio:', {
      to: formattedPhone,
      sid: result.sid,
      status: result.status
    });

    return {
      status: 'SENT',
      providerRef: result.sid
    };
  } catch (error) {
    console.error('[SMS] Twilio error:', error);
    return {
      status: 'FAILED',
      providerRef: undefined
    };
  }
};

/**
 * Send SMS via Hubtel (Ghanaian SMS provider)
 */
const sendViaHubtel = async (to: string, message: string): Promise<SmsResult> => {
  try {
    if (!env.HUBTEL_CLIENT_ID || !env.HUBTEL_CLIENT_SECRET || !env.HUBTEL_SENDER_ID) {
      throw new Error('Hubtel not configured');
    }

    const response = await fetch('https://api.hubtel.com/v1/sms/send', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${env.HUBTEL_CLIENT_ID}:${env.HUBTEL_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        To: to,
        Content: message,
        ClientReference: randomUUID(),
        SenderID: env.HUBTEL_SENDER_ID
      })
    });

    if (!response.ok) {
      throw new Error(`Hubtel API error: ${response.statusText}`);
    }

    const data = await response.json() as any;

    console.info('[SMS] Sent via Hubtel:', {
      to,
      status: data.Status,
      messageId: data.MessageId
    });

    return {
      status: 'SENT',
      providerRef: data.MessageId
    };
  } catch (error) {
    console.error('[SMS] Hubtel error:', error);
    return {
      status: 'FAILED',
      providerRef: undefined
    };
  }
};

/**
 * Send SMS via mock provider (for development)
 */
const sendViaMock = async (to: string, message: string): Promise<SmsResult> => {
  console.info('[SMS] Mock send:', {
    to,
    message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
    timestamp: new Date().toISOString()
  });

  return {
    status: 'SENT',
    providerRef: `mock-${randomUUID()}`
  };
};

/**
 * Main SMS sending function
 * Routes to appropriate provider based on environment
 */
export const sendSms = async (to: string, message: string): Promise<SmsResult> => {
  if (!to || !to.trim()) {
    console.error('[SMS] Invalid recipient:', to);
    return {
      status: 'FAILED',
      providerRef: undefined
    };
  }

  switch (env.SMS_PROVIDER) {
    case 'TWILIO':
      return sendViaTwilio(to, message);
    case 'HUBTEL':
      return sendViaHubtel(to, message);
    case 'MOCK':
    default:
      return sendViaMock(to, message);
  }
};
