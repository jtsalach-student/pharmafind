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
      email: z.string().email().optional(),
      mockPayment: z.boolean().optional(),
      paymentResult: z.enum(['success', 'failed']).optional()
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

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ error: { message: 'User not found', requestId: req.requestId } });
      return;
    }
    const email = parsed.data.email ?? user.email;

    const existing = await prisma.payment.findUnique({ where: { reference } });
    if (existing) {
      res.status(409).json({ error: { message: 'Reference already exists', requestId: req.requestId } });
      return;
    }

    if (parsed.data.mockPayment) {
      const outcome = parsed.data.paymentResult === 'failed' ? 'failed' : 'success';
      const mockStatus = outcome === 'success' ? 'PAID' : 'FAILED';
      const payment = await prisma.payment.create({
        data: {
          deliveryId: delivery.id,
          reference,
          amountGhs: parsed.data.amountGhs,
          status: mockStatus,
          provider: 'MOCK',
          providerResponse: JSON.stringify({ mode: 'mock', status: outcome, message: outcome === 'success' ? 'Mock payment succeeded' : 'Mock payment failed' })
        }
      });

      if (outcome === 'success') {
        await prisma.deliveryRequest.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.REQUESTED } });
        await createUserNotification(req.user!.id, 'Mock payment successful. Your delivery has been requested.', 'PAYMENT_SUCCESS');

        const prescription = await prisma.prescription.findUnique({ where: { id: delivery.prescriptionId } });
        if (prescription?.pharmacyId) {
          const admins = await prisma.adminUser.findMany({ where: { pharmacyId: prescription.pharmacyId } });
          for (const admin of admins) {
            await createUserNotification(admin.userId, 'Mock payment received. Delivery order is now requested.', 'PAYMENT_SUCCESS');
          }
        }

        console.info('[Mock Payment] Successful payment processed', { reference, paymentId: payment.id, deliveryId: delivery.id });
        res.status(201).json({
          payment,
          gateway: {
            status: true,
            message: 'Mock payment initialized successfully',
            data: {
              authorization_url: `https://mock.paystack.local/checkout/${reference}`,
              access_code: `mock_${reference}`,
              reference
            }
          },
          reference,
          mock: true
        });
        return;
      }

      await prisma.deliveryRequest.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.CANCELLED } });
      await createUserNotification(req.user!.id, 'Payment failed. Order cancelled.', 'PAYMENT_FAILED');

      const prescription = await prisma.prescription.findUnique({ where: { id: delivery.prescriptionId } });
      if (prescription?.pharmacyId) {
        const admins = await prisma.adminUser.findMany({ where: { pharmacyId: prescription.pharmacyId } });
        for (const admin of admins) {
          await createUserNotification(admin.userId, 'Mock payment failed. Order cancelled.', 'PAYMENT_FAILED');
        }
      }

      console.info('[Mock Payment] Failed payment processed', { reference, paymentId: payment.id, deliveryId: delivery.id });
      res.status(400).json({
        error: { message: 'Payment failed. Order cancelled.', requestId: req.requestId },
        reference,
        mock: true
      });
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

    console.info('[Paystack Verify] Payment verification initiated', { reference, paymentId: payment.id });
    const verification = await verifyPayment(reference);
    console.info('[Paystack Verify] Verification response received', {
      reference,
      verificationStatus: verification.status,
      paymentDataStatus: verification.data?.status,
      amount: verification.data?.amount,
      paidAt: verification.data?.paid_at
    });

    // FIX: Check verification.data.status (string), NOT verification.status (boolean)
    if (verification.data?.status === 'success') {
      console.info('[Paystack Verify] Payment verified as successful', { reference, amount: verification.data.amount });
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
      console.info('[Paystack Verify] Payment flow completed successfully', { paymentId: updated.id, deliveryId: delivery.id });
      res.json(updated);
      return;
    }

    // Payment verification failed
    console.error('[Paystack Verify] Payment verification failed', {
      reference,
      paymentStatus: verification.data?.status,
      verificationStatusBoolean: verification.status,
      message: verification.message
    });
    await prisma.deliveryRequest.update({ where: { id: payment.deliveryId }, data: { status: DeliveryStatus.CANCELLED } });
    await createUserNotification(req.user!.id, `Payment failed (${verification.data?.status}). Your delivery request has been cancelled.`, 'PAYMENT_FAILED');
    res.status(400).json({ error: { message: `Payment not verified: ${verification.data?.status}`, requestId: req.requestId } });
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
