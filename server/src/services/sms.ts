import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

export type SmsResult = { status: 'SENT' | 'FAILED'; providerRef?: string };

export const sendSms = async (_to: string, _message: string): Promise<SmsResult> => {
  if (env.SMS_PROVIDER === 'MOCK') {
    return { status: 'SENT', providerRef: `mock-${randomUUID()}` };
  }
  return { status: 'FAILED' };
};
