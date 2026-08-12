import type { PaymentStatus } from '@prisma/client';

export const shouldMarkPaidFromWebhook = (currentStatus: PaymentStatus, incomingStatus: string): boolean =>
  currentStatus !== 'PAID' && incomingStatus === 'success';
