import { Router } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { initializePayment, verifyPayment } from '../services/paystack.js';
import { writeAudit } from '../utils/audit.js';
import { shouldMarkPaidFromWebhook } from '../utils/payment.js';

const router = Router();

router.post('/initialize', requireAuth, async (req, res, next) => {
  try {
    const parsed = z.object({ deliveryId: z.string(), amountGhs: z.number().positive(), reference: z.string().min(3) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payment payload', requestId: req.requestId } });
      return;
    }

    const delivery = await prisma.deliveryRequest.findUnique({ where: { id: parsed.data.deliveryId } });
    if (!delivery || delivery.userId !== req.user!.id) {
      res.status(404).json({ error: { message: 'Delivery not found', requestId: req.requestId } });
      return;
    }

    const existing = await prisma.payment.findUnique({ where: { reference: parsed.data.reference } });
    if (existing) {
      res.status(409).json({ error: { message: 'Reference already exists', requestId: req.requestId } });
      return;
    }

    const payment = await prisma.payment.create({
      data: {
        deliveryId: delivery.id,
        reference: parsed.data.reference,
        amountGhs: parsed.data.amountGhs,
        status: 'PENDING'
      }
    });

    const initialized = await initializePayment(parsed.data.reference, parsed.data.amountGhs, `${req.user!.username}@example.com`);
    res.status(201).json({ payment, gateway: initialized });
  } catch (error) {
    next(error);
  }
});

router.get('/:reference/verify', requireAuth, async (req, res, next) => {
  try {
    const reference = String(req.params.reference);
    const payment = await prisma.payment.findUnique({ where: { reference }, include: { delivery: true } });
    if (!payment || payment.delivery.userId !== req.user!.id) {
      res.status(404).json({ error: { message: 'Payment not found', requestId: req.requestId } });
      return;
    }

    if (payment.status === 'PAID') {
      res.json(payment);
      return;
    }

    const verification = await verifyPayment(reference);
    if (verification.status === 'success') {
      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', verifiedAt: new Date(), providerResponse: JSON.stringify(verification) }
      });
      await writeAudit({ actorId: req.user!.id, action: 'PAYMENT_VERIFIED', targetEntity: 'Payment', targetId: updated.id, outcome: 'SUCCESS' });
      res.json(updated);
      return;
    }

    res.status(400).json({ error: { message: 'Payment not verified', requestId: req.requestId } });
  } catch (error) {
    next(error);
  }
});

router.post('/webhook', async (req, res, next) => {
  try {
    const parsed = z.object({ reference: z.string(), status: z.string() }).safeParse(req.body?.data ?? req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false });
      return;
    }

    const payment = await prisma.payment.findUnique({ where: { reference: parsed.data.reference } });
    if (!payment) {
      res.status(404).json({ ok: false });
      return;
    }

    if (payment.status === 'PAID') {
      res.json({ ok: true, idempotent: true });
      return;
    }

    if (shouldMarkPaidFromWebhook(payment.status, parsed.data.status)) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          verifiedAt: new Date(),
          providerResponse: JSON.stringify(req.body)
        }
      });
      await writeAudit({ action: 'PAYMENT_WEBHOOK_VERIFIED', targetEntity: 'Payment', targetId: payment.id, outcome: 'SUCCESS' });
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
