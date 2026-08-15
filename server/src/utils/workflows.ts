import { DeliveryStatus, Role } from '@prisma/client';

export const deliveryTransitions: Record<DeliveryStatus, DeliveryStatus[]> = {
  REQUESTED: [DeliveryStatus.ASSIGNED, DeliveryStatus.COLLECTED, DeliveryStatus.CANCELLED],
  ASSIGNED: [DeliveryStatus.COLLECTED, DeliveryStatus.CANCELLED],
  COLLECTED: [DeliveryStatus.IN_TRANSIT, DeliveryStatus.CANCELLED],
  IN_TRANSIT: [DeliveryStatus.DELIVERED, DeliveryStatus.COMPLETED, DeliveryStatus.CANCELLED],
  DELIVERED: [DeliveryStatus.COMPLETED, DeliveryStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: []
};

export const canTransitionDelivery = (from: DeliveryStatus, to: DeliveryStatus): boolean => deliveryTransitions[from].includes(to);

export const canDriverUpdateGps = (
  role: Role,
  assignedDriverId: string | null,
  currentDriverId: string,
  status: DeliveryStatus
): boolean =>
  role === Role.DRIVER &&
  assignedDriverId === currentDriverId &&
  [DeliveryStatus.ASSIGNED, DeliveryStatus.COLLECTED, DeliveryStatus.IN_TRANSIT].includes(
    status as 'ASSIGNED' | 'COLLECTED' | 'IN_TRANSIT'
  );
