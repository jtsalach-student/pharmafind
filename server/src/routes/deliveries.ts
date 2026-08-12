import { Router } from 'express';
import { DeliveryStatus, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';
import { canTransitionDelivery } from '../utils/workflows.js';

const router = Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = z.object({ prescriptionId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'prescriptionId required', requestId: req.requestId } });
      return;
    }

    const prescription = await prisma.prescription.findUnique({ where: { id: parsed.data.prescriptionId } });
    if (!prescription || prescription.userId !== req.user!.id) {
      res.status(404).json({ error: { message: 'Prescription not found', requestId: req.requestId } });
      return;
    }

    if (prescription.status !== 'APPROVED') {
      res.status(400).json({ error: { message: 'Prescription must be approved before delivery request', requestId: req.requestId } });
      return;
    }

    const delivery = await prisma.deliveryRequest.create({
      data: { userId: req.user!.id, prescriptionId: prescription.id }
    });

    await writeAudit({ actorId: req.user!.id, action: 'DELIVERY_CREATE', targetEntity: 'DeliveryRequest', targetId: delivery.id, outcome: 'SUCCESS' });
    res.status(201).json(delivery);
  } catch (error) {
    next(error);
  }
});

router.get('/my', requireAuth, async (req, res, next) => {
  try {
    const deliveries = await prisma.deliveryRequest.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: 'desc' } });
    res.json({ items: deliveries });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const deliveryId = String(req.params.id);
    const delivery = await prisma.deliveryRequest.findUnique({ where: { id: deliveryId }, include: { gpsLocations: true, payment: true } });
    if (!delivery || (req.user!.role === 'USER' && delivery.userId !== req.user!.id)) {
      res.status(404).json({ error: { message: 'Delivery not found', requestId: req.requestId } });
      return;
    }
    res.json(delivery);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', requireAuth, requireRoles(Role.DRIVER, Role.PHARMACY_ADMIN, Role.SYSTEM_ADMIN), async (req, res, next) => {
  try {
    const deliveryId = String(req.params.id);
    const parsed = z.object({ status: z.nativeEnum(DeliveryStatus) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid status payload', requestId: req.requestId } });
      return;
    }

    const delivery = await prisma.deliveryRequest.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      res.status(404).json({ error: { message: 'Delivery not found', requestId: req.requestId } });
      return;
    }

    if (req.user!.role === Role.DRIVER) {
      const driver = await prisma.driver.findUnique({ where: { userId: req.user!.id } });
      if (!driver || delivery.driverId !== driver.id) {
        res.status(403).json({ error: { message: 'Only assigned driver can update', requestId: req.requestId } });
        return;
      }
    }

    if (!canTransitionDelivery(delivery.status, parsed.data.status)) {
      res.status(400).json({ error: { message: 'Invalid state transition', requestId: req.requestId } });
      return;
    }

    const updated = await prisma.deliveryRequest.update({ where: { id: deliveryId }, data: { status: parsed.data.status } });
    await writeAudit({ actorId: req.user!.id, action: 'DELIVERY_STATUS_UPDATE', targetEntity: 'DeliveryRequest', targetId: updated.id, outcome: 'SUCCESS', metadata: { from: delivery.status, to: updated.status } });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/assign-driver', requireAuth, requireRoles(Role.PHARMACY_ADMIN, Role.SYSTEM_ADMIN), async (req, res, next) => {
  try {
    const deliveryId = String(req.params.id);
    const parsed = z.object({ driverId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'driverId required', requestId: req.requestId } });
      return;
    }

    const delivery = await prisma.deliveryRequest.update({
      where: { id: deliveryId },
      data: { driverId: parsed.data.driverId, status: 'ASSIGNED' }
    });

    await writeAudit({ actorId: req.user!.id, action: 'DELIVERY_ASSIGNED', targetEntity: 'DeliveryRequest', targetId: delivery.id, outcome: 'SUCCESS', metadata: { driverId: parsed.data.driverId } });
    res.json(delivery);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/location', requireAuth, async (req, res, next) => {
  try {
    const deliveryId = String(req.params.id);
    const delivery = await prisma.deliveryRequest.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      res.status(404).json({ error: { message: 'Delivery not found', requestId: req.requestId } });
      return;
    }
    if (req.user!.role === Role.USER && delivery.userId !== req.user!.id) {
      res.status(403).json({ error: { message: 'Forbidden', requestId: req.requestId } });
      return;
    }
    const locations = await prisma.gPSLocation.findMany({ where: { deliveryId: delivery.id }, orderBy: { createdAt: 'desc' }, take: 50 });
    const latest = locations[0];
    const stale = latest ? Date.now() - latest.createdAt.getTime() > 60_000 : true;
    res.json({ locations, stale });
  } catch (error) {
    next(error);
  }
});

export default router;
