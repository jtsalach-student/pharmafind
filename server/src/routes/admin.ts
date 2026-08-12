import { Router } from 'express';
import { DeliveryStatus, Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', requireAuth, requireRoles(Role.PHARMACY_ADMIN, Role.SYSTEM_ADMIN), async (req, res, next) => {
  try {
    const admin = await prisma.adminUser.findUnique({ where: { userId: req.user!.id } });
    const pharmacyFilter = admin?.pharmacyId ? { pharmacyId: admin.pharmacyId } : {};

    const [totalMedicines, lowStockCount, pendingPrescriptionCount, activeDeliveryCount, recentAuditActivity] = await Promise.all([
      prisma.inventory.count({ where: { ...pharmacyFilter, isActive: true } }),
      prisma.inventory.count({ where: { ...pharmacyFilter, quantity: { lte: 5 }, isActive: true } }),
      prisma.prescription.count({ where: { ...pharmacyFilter, status: 'PENDING_REVIEW' } }),
      prisma.deliveryRequest.count({ where: { status: { in: [DeliveryStatus.ASSIGNED, DeliveryStatus.COLLECTED, DeliveryStatus.IN_TRANSIT] } } }),
      prisma.auditLog.findMany({ take: 10, orderBy: { createdAt: 'desc' } })
    ]);

    res.json({
      totalMedicines,
      lowStockCount,
      pendingPrescriptionCount,
      activeDeliveryCount,
      recentAuditActivity
    });
  } catch (error) {
    next(error);
  }
});

export default router;
