import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { comparePassword, hashPassword, signToken, validatePassword } from '../utils/auth.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();

const registerSchema = z.object({
  username: z.string().min(3),
  password: z.string(),
  fullName: z.string().optional(),
  phone: z.string().optional()
});

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { username, password, fullName, phone } = req.body;
    if (!validatePassword(password)) {
      res.status(400).json({ error: { message: 'Password does not meet complexity rules', requestId: req.requestId } });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      res.status(409).json({ error: { message: 'Username already exists', requestId: req.requestId } });
      return;
    }

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await hashPassword(password),
        fullName,
        phone
      }
    });

    const token = signToken({ id: user.id, role: user.role, username: user.username });
    await writeAudit({ actorId: user.id, action: 'REGISTER', targetEntity: 'User', targetId: user.id, outcome: 'SUCCESS' });

    res.status(201).json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    next(error);
  }
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string()
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !(await comparePassword(password, user.passwordHash))) {
      await writeAudit({ action: 'LOGIN', targetEntity: 'User', targetId: user?.id, outcome: 'FAILED', metadata: { username } });
      res.status(401).json({ error: { message: 'Invalid credentials', requestId: req.requestId } });
      return;
    }

    await writeAudit({ actorId: user.id, action: 'LOGIN', targetEntity: 'User', targetId: user.id, outcome: 'SUCCESS' });
    const token = signToken({ id: user.id, role: user.role, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ error: { message: 'User not found', requestId: req.requestId } });
      return;
    }
    res.json({ id: user.id, username: user.username, role: user.role, fullName: user.fullName, phone: user.phone });
  } catch (error) {
    next(error);
  }
});

export default router;
