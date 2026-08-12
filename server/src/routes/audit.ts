import { Router } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireRoles(Role.SYSTEM_ADMIN), async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 50);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count()
    ]);
    res.json({ page, limit, total, items });
  } catch (error) {
    next(error);
  }
});

export default router;
