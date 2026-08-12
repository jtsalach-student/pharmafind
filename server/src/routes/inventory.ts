import { Router } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles(Role.PHARMACY_ADMIN));

const inventoryInput = z.object({
  pharmacyId: z.string().min(1),
  drugId: z.string().min(1),
  quantity: z.number().int().min(0),
  isAvailable: z.boolean().default(true)
});

router.get('/', async (req, res, next) => {
  try {
    const admin = await prisma.adminUser.findUnique({ where: { userId: req.user!.id } });
    const where = admin?.pharmacyId ? { pharmacyId: admin.pharmacyId } : {};
    const items = await prisma.inventory.findMany({ where, include: { drug: true, pharmacy: true } });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = inventoryInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', requestId: req.requestId } });
      return;
    }

    const admin = await prisma.adminUser.findUnique({ where: { userId: req.user!.id } });
    if (admin?.pharmacyId && admin.pharmacyId !== parsed.data.pharmacyId) {
      res.status(403).json({ error: { message: 'Cannot manage other pharmacies', requestId: req.requestId } });
      return;
    }

    const item = await prisma.inventory.create({ data: parsed.data });
    await writeAudit({ actorId: req.user!.id, action: 'INVENTORY_CREATE', targetEntity: 'Inventory', targetId: item.id, outcome: 'SUCCESS' });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const parsed = z
      .object({ quantity: z.number().int().min(0).optional(), isAvailable: z.boolean().optional(), isActive: z.boolean().optional() })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', requestId: req.requestId } });
      return;
    }

    const item = await prisma.inventory.findUnique({ where: { id: req.params.id } });
    if (!item) {
      res.status(404).json({ error: { message: 'Inventory not found', requestId: req.requestId } });
      return;
    }

    const admin = await prisma.adminUser.findUnique({ where: { userId: req.user!.id } });
    if (admin?.pharmacyId && admin.pharmacyId !== item.pharmacyId) {
      res.status(403).json({ error: { message: 'Cannot manage other pharmacies', requestId: req.requestId } });
      return;
    }

    const updated = await prisma.inventory.update({ where: { id: req.params.id }, data: parsed.data });
    await writeAudit({ actorId: req.user!.id, action: 'INVENTORY_UPDATE', targetEntity: 'Inventory', targetId: updated.id, outcome: 'SUCCESS' });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const item = await prisma.inventory.findUnique({ where: { id: req.params.id } });
    if (!item) {
      res.status(404).json({ error: { message: 'Inventory not found', requestId: req.requestId } });
      return;
    }

    const admin = await prisma.adminUser.findUnique({ where: { userId: req.user!.id } });
    if (admin?.pharmacyId && admin.pharmacyId !== item.pharmacyId) {
      res.status(403).json({ error: { message: 'Cannot manage other pharmacies', requestId: req.requestId } });
      return;
    }

    const updated = await prisma.inventory.update({ where: { id: req.params.id }, data: { isActive: false } });
    await writeAudit({ actorId: req.user!.id, action: 'INVENTORY_DEACTIVATE', targetEntity: 'Inventory', targetId: updated.id, outcome: 'SUCCESS' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
