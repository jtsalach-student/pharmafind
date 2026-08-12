import { Router } from 'express';
import { DeliveryStatus, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';
import { canDriverUpdateGps } from '../utils/workflows.js';

const router = Router();

router.post('/location', requireAuth, requireRoles(Role.DRIVER), async (req, res, next) => {
  try {
    const parsed = z.object({ deliveryId: z.string(), latitude: z.number(), longitude: z.number() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid location payload', requestId: req.requestId } });
      return;
    }

    const driver = await prisma.driver.findUnique({ where: { userId: req.user!.id } });
    if (!driver) {
      res.status(403).json({ error: { message: 'Driver profile missing', requestId: req.requestId } });
      return;
    }

    const delivery = await prisma.deliveryRequest.findUnique({ where: { id: parsed.data.deliveryId } });
    if (!delivery || !canDriverUpdateGps(req.user!.role, delivery.driverId, driver.id, delivery.status)) {
      res.status(403).json({ error: { message: 'Location update not allowed for this delivery', requestId: req.requestId } });
      return;
    }

    const location = await prisma.gPSLocation.create({
      data: {
        driverId: driver.id,
        deliveryId: delivery.id,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude
      }
    });

    await writeAudit({ actorId: req.user!.id, action: 'GPS_UPDATE', targetEntity: 'DeliveryRequest', targetId: delivery.id, outcome: 'SUCCESS' });
    res.status(201).json(location);
  } catch (error) {
    next(error);
  }
});

router.get('/deliveries/:id/location', requireAuth, async (req, res, next) => {
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

    const locations = await prisma.gPSLocation.findMany({ where: { deliveryId }, orderBy: { createdAt: 'desc' }, take: 50 });
    const latest = locations[0];
    const stale = latest ? Date.now() - latest.createdAt.getTime() > 60_000 : true;

    res.json({ locations, stale });
  } catch (error) {
    next(error);
  }
});

export default router;
