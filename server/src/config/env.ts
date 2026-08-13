import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('1d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_BASE_URL: z.string().default('https://api.paystack.co'),
  SMS_PROVIDER: z.enum(['MOCK', 'TWILIO', 'HUBTEL']).default('MOCK'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  HUBTEL_CLIENT_ID: z.string().optional(),
  HUBTEL_CLIENT_SECRET: z.string().optional(),
  HUBTEL_SENDER_ID: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  STORAGE_DIR: z.string().default('uploads')
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
