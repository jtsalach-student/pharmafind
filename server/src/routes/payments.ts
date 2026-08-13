import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { DeliveryStatus, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { initializePayment, verifyPayment } from '../services/paystack.js';
import { writeAudit } from '../utils/audit.js';
import { shouldMarkPaidFromWebhook } from '../utils/payment.js';

const createUserNotification = async (userId: string, message: string, type: string) => {
  await prisma.notification.create({
    data: {
      userId,
      message,
      type,
      provider: 'SYSTEM',
      status: 'SENT'
    }
  });
};

const router = Router();

router.post('/initialize', requireAuth, async (req, res, next) => {
  try {
    const parsed = z.object({
      prescriptionId: z.string().min(1).optional(),
      deliveryId: z.string().optional(),
      amountGhs: z.number().positive(),
      reference: z.string().min(3).optional(),
      email: z.string().email().optional()
    }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payment payload', requestId: req.requestId } });
      return;
    }

    let delivery = null;

    if (parsed.data.deliveryId) {
      delivery = await prisma.deliveryRequest.findUnique({ where: { id: parsed.data.deliveryId } });
    } else if (parsed.data.prescriptionId) {
      delivery = await prisma.deliveryRequest.findFirst({
        where: {
          userId: req.user!.id,
          prescriptionId: parsed.data.prescriptionId,
          status: { not: DeliveryStatus.CANCELLED }
        }
      });

      if (!delivery) {
        delivery = await prisma.deliveryRequest.create({
          data: {
            userId: req.user!.id,
            prescriptionId: parsed.data.prescriptionId,
            status: DeliveryStatus.REQUESTED
          }
        });
      }
    }

    if (!delivery || delivery.userId !== req.user!.id) {
      res.status(404).json({ error: { message: 'Delivery not found', requestId: req.requestId } });
      return;
    }

    const reference = parsed.data.reference ?? `pay_${randomUUID().replace(/-/g, '')}`;
    const email = parsed.data.email ?? `${req.user!.username}@example.com`;

    const existing = await prisma.payment.findUnique({ where: { reference } });
    if (existing) {
      res.status(409).json({ error: { message: 'Reference already exists', requestId: req.requestId } });
      return;
    }

    const payment = await prisma.payment.create({
      data: {
        deliveryId: delivery.id,
        reference,
        amountGhs: parsed.data.amountGhs,
        status: 'PENDING'
      }
    });

    const initialized = await initializePayment(email, parsed.data.amountGhs, { reference, deliveryId: delivery.id, userId: req.user!.id });
    res.status(201).json({ payment, gateway: initialized, reference });
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

      const delivery = await prisma.deliveryRequest.findUnique({ where: { id: payment.deliveryId } });
      if (!delivery) {
        res.status(404).json({ error: { message: 'Delivery request missing for payment', requestId: req.requestId } });
        return;
      }

      if (delivery.status !== DeliveryStatus.REQUESTED) {
        await prisma.deliveryRequest.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.REQUESTED } });
      }

      await createUserNotification(req.user!.id, 'Payment successful. Your delivery has been requested.', 'PAYMENT_SUCCESS');
      await writeAudit({ actorId: req.user!.id, action: 'PAYMENT_VERIFIED', targetEntity: 'Payment', targetId: updated.id, outcome: 'SUCCESS' });
      res.json(updated);
      return;
    }

    await prisma.deliveryRequest.update({ where: { id: payment.deliveryId }, data: { status: DeliveryStatus.CANCELLED } });
    await createUserNotification(req.user!.id, 'Payment failed. Your delivery request has been cancelled.', 'PAYMENT_FAILED');
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

    const payment = await prisma.payment.findUnique({ where: { reference: parsed.data.reference }, include: { delivery: true } });
    if (!payment) {
      res.status(404).json({ ok: false });
      return;
    }

    if (payment.status === 'PAID') {
      res.json({ ok: true, idempotent: true });
      return;
    }

    if (shouldMarkPaidFromWebhook(payment.status, parsed.data.status)) {
      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          verifiedAt: new Date(),
          providerResponse: JSON.stringify(req.body)
        }
      });

      const delivery = await prisma.deliveryRequest.findUnique({ where: { id: payment.deliveryId } });
      if (delivery) {
        await prisma.deliveryRequest.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.REQUESTED } });
      }

      await createUserNotification(payment.delivery.userId, 'Payment successful. Your delivery has been requested.', 'PAYMENT_SUCCESS');
      await writeAudit({ action: 'PAYMENT_WEBHOOK_VERIFIED', targetEntity: 'Payment', targetId: updated.id, outcome: 'SUCCESS' });
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
