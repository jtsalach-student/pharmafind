import { describe, expect, it } from 'vitest';
import { DeliveryStatus } from '@prisma/client';
import {
  buildPrescriptionStatusMessage,
  createDeliveryStatusMessage,
  shouldCancelDeliveryForPrescriptionDecision
} from '../src/utils/notifications.js';

describe('prescription and delivery workflow messaging', () => {
  it('returns the required user messages for approval and rejection', () => {
    expect(buildPrescriptionStatusMessage('APPROVED')).toContain('approved');
    expect(buildPrescriptionStatusMessage('REJECTED')).toContain('rejected');
    expect(buildPrescriptionStatusMessage('CLARIFICATION_REQUESTED')).toContain('clarification');
  });

  it('marks cancelled delivery for rejected or failed states', () => {
    expect(shouldCancelDeliveryForPrescriptionDecision('REJECTED')).toBe(true);
    expect(shouldCancelDeliveryForPrescriptionDecision('CLARIFICATION_REQUESTED')).toBe(false);
    expect(createDeliveryStatusMessage(DeliveryStatus.CANCELLED)).toContain('cancelled');
  });
});
