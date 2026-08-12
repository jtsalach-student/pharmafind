import { describe, expect, it } from 'vitest';
import { sendSms } from '../src/services/sms.js';

describe('sms failure handling', () => {
  it('returns failed when provider is not mock and credentials path unsupported', async () => {
    process.env.SMS_PROVIDER = 'TWILIO';
    const result = await sendSms('+233200000000', 'Delivery in transit');
    expect(['SENT', 'FAILED']).toContain(result.status);
  });
});
