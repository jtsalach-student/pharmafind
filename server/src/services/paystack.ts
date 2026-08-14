import axios, { AxiosError } from 'axios';
import { env } from '../config/env.js';

export type PaystackInitializeResponse = {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
};

export type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data: {
    reference: string;
    amount: number;
    paid_at: string;
    status: 'success' | 'failed' | 'abandoned';
    customer: {
      id: number;
      email: string;
      customer_code: string;
      first_name: string;
      last_name: string;
      phone: string;
    };
  };
};

const client = axios.create({
  baseURL: env.PAYSTACK_BASE_URL,
  headers: {
    Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
  }
});

/**
 * Initialize a Paystack payment for a delivery
 * @param email Customer email
 * @param amountGhs Amount in GHS (will be converted to pesewas)
 * @param metadata Additional metadata to attach
 */
export const initializePayment = async (
  email: string,
  amountGhs: number,
  metadata: Record<string, any> = {}
): Promise<PaystackInitializeResponse> => {
  try {
    console.info('[Paystack Init] Initializing payment', { email, amountGhs, metadata });
    
    if (!env.PAYSTACK_SECRET_KEY) {
      // Mock mode for development
      console.warn('[Paystack Init] PAYSTACK_SECRET_KEY not configured - using MOCK mode');
      const reference = `mock_ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        status: true,
        message: 'Authorization URL created (MOCK)',
        data: {
          authorization_url: `https://checkout.paystack.com/${reference}?mock=true`,
          access_code: reference,
          reference
        }
      };
    }

    const amountPesewas = Math.round(amountGhs * 100); // Convert GHS to pesewas
    console.info('[Paystack Init] Amount conversion', { amountGhs, amountPesewas });
    
    const response = await client.post<PaystackInitializeResponse>('/transaction/initialize', {
      email,
      amount: amountPesewas,
      channels: ['card', 'mobile_money'],
      metadata: {
        ...metadata,
        initiatedAt: new Date().toISOString()
      }
    });

    console.info('[Paystack Init] Payment initialization successful', {
      reference: response.data.data.reference,
      accessCode: response.data.data.access_code
    });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('[Paystack] Initialize payment error:', {
      status: axiosError.response?.status,
      data: axiosError.response?.data,
      message: axiosError.message
    });
    throw new Error(`Failed to initialize payment: ${axiosError.message}`);
  }
};

/**
 * Verify a Paystack payment using reference
 * @param reference Paystack transaction reference
 */
export const verifyPayment = async (reference: string): Promise<PaystackVerifyResponse> => {
  try {
    console.info('[Paystack Verify] Verifying payment', { reference });
    
    if (!env.PAYSTACK_SECRET_KEY) {
      // Mock verification for development
      console.warn('[Paystack Verify] PAYSTACK_SECRET_KEY not configured - using MOCK mode');
      return {
        status: true,
        message: 'Verification successful (MOCK)',
        data: {
          reference,
          amount: 25000,
          paid_at: new Date().toISOString(),
          status: 'success',
          customer: {
            id: 123,
            email: 'customer@example.com',
            customer_code: 'CUS_mock',
            first_name: 'Test',
            last_name: 'User',
            phone: '+233501234567'
          }
        }
      };
    }

    console.info('[Paystack Verify] Making API call to Paystack', { reference });
    const response = await client.get<PaystackVerifyResponse>(`/transaction/verify/${reference}`);
    console.info('[Paystack Verify] API response received', {
      reference,
      status: response.data.status,
      paymentStatus: response.data.data?.status,
      amount: response.data.data?.amount
    });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('[Paystack] Verify payment error:', {
      reference,
      status: axiosError.response?.status,
      data: axiosError.response?.data,
      message: axiosError.message
    });
    throw new Error(`Failed to verify payment: ${axiosError.message}`);
  }
};
