import { Router } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { sendPushNotification } from '../services/push-notifications.js';
import { sendSms } from '../services/sms.js';

const router = Router();

router.post('/send', requireAuth, requireRoles(Role.SYSTEM_ADMIN, Role.PHARMACY_ADMIN), async (req, res, next) => {
  try {
    const parsed = z.object({
      userId: z.string(),
      message: z.string().min(2),
      type: z.string().min(2),
      deviceToken: z.string().optional()
    }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid notification payload', requestId: req.requestId } });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) {
      res.status(404).json({ error: { message: 'User not found', requestId: req.requestId } });
      return;
    }

    const smsResult = user.phone ? await sendSms(user.phone, parsed.data.message) : { status: 'FAILED' as const, providerRef: undefined };
    const pushResult = parsed.data.deviceToken
      ? await sendPushNotification(parsed.data.deviceToken, {
          title: 'PharmaFind Update',
          body: parsed.data.message,
          data: { type: parsed.data.type }
        })
      : { status: 'SKIPPED' as const };

    const record = await prisma.notification.create({
      data: {
        userId: user.id,
        message: parsed.data.message,
        type: parsed.data.type,
        provider: smsResult.status === 'SENT' ? 'SMS' : (pushResult.status === 'SENT' ? 'FCM' : 'SYSTEM'),
        providerRef: smsResult.providerRef ?? pushResult.messageId,
        status: smsResult.status === 'SENT' || pushResult.status === 'SENT' ? 'SENT' : 'FAILED'
      }
    });

    res.status(201).json({ ...record, smsResult, pushResult });
  } catch (error) {
    next(error);
  }
});

router.get('/my', requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== req.user!.id) {
      res.status(404).json({
        error: {
          message: 'Notification not found',
          requestId: req.requestId
        }
      });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { status: 'DELIVERED', updatedAt: new Date() }
    });

    res.json({ notification: updated });
  } catch (error) {
    next(error);
  }
});

router.post('/read-all', requireAuth, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id },
      data: { status: 'DELIVERED', updatedAt: new Date() }
    });

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
});

export default router;
