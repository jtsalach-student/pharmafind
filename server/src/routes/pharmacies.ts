import { Router } from 'express';
import { prisma } from '../config/prisma.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const [items, total] = await Promise.all([
      prisma.pharmacy.findMany({ skip: (page - 1) * limit, take: limit }),
      prisma.pharmacy.count()
    ]);
    res.json({ page, limit, total, items });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: req.params.id },
      include: { inventory: { include: { drug: true } } }
    });
    if (!pharmacy) {
      res.status(404).json({ error: { message: 'Pharmacy not found', requestId: req.requestId } });
      return;
    }
    res.json(pharmacy);
  } catch (error) {
    next(error);
  }
});

export default router;
