import { DeliveryStatus } from '@prisma/client';

export type PrescriptionDecision = 'APPROVED' | 'REJECTED' | 'CLARIFICATION_REQUESTED';

export const buildPrescriptionStatusMessage = (status: PrescriptionDecision): string => {
  switch (status) {
    case 'APPROVED':
      return 'Your prescription has been approved. Proceed to payment.';
    case 'REJECTED':
      return 'Your prescription has been rejected.';
    case 'CLARIFICATION_REQUESTED':
      return 'Your prescription needs clarification. Please upload a new prescription.';
    default:
      return 'Prescription status updated.';
  }
};

export const shouldCancelDeliveryForPrescriptionDecision = (status: PrescriptionDecision): boolean => status === 'REJECTED';

export const createDeliveryStatusMessage = (status: DeliveryStatus): string => {
  switch (status) {
    case DeliveryStatus.REQUESTED:
      return 'Delivery requested.';
    case DeliveryStatus.ASSIGNED:
      return 'Driver assigned to your delivery.';
    case DeliveryStatus.COLLECTED:
      return 'Driver collected the order.';
    case DeliveryStatus.IN_TRANSIT:
      return 'Your order is in transit.';
    case DeliveryStatus.COMPLETED:
      return 'Your delivery has been completed.';
    case DeliveryStatus.CANCELLED:
      return 'Your delivery has been cancelled.';
    default:
      return 'Delivery status updated.';
  }
};
