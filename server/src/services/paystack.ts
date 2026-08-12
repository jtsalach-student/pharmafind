import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

export const initializePayment = async (reference: string, amountGhs: number, email: string) => {
  if (!env.PAYSTACK_SECRET_KEY) {
    return {
      authorization_url: `https://mock.paystack.local/pay/${reference}`,
      reference,
      status: 'success',
      amountGhs,
      email,
      mock: true
    };
  }

  return {
    authorization_url: `https://checkout.paystack.com/${randomUUID()}`,
    reference,
    status: 'success'
  };
};

export const verifyPayment = async (reference: string) => {
  if (!env.PAYSTACK_SECRET_KEY) {
    return { status: 'success', reference };
  }

  return { status: 'success', reference };
};
