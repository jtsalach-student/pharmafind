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
    const items = await prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' } });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

export default router;
