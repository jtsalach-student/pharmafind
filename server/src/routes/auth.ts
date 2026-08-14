import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { comparePassword, hashPassword, signToken, validatePassword } from '../utils/auth.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Enter a valid email'),
  password: z.string(),
  fullName: z.string().optional(),
  phone: z.string().optional()
});

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { username, email, password, fullName, phone } = req.body;
    const normalizedUsername = String(username ?? '').trim().toLowerCase();
    const normalizedEmail = String(email ?? '').trim().toLowerCase();

    if (!normalizedUsername) {
      res.status(400).json({ error: { message: 'Username is required', requestId: req.requestId } });
      return;
    }

    if (!normalizedEmail) {
      res.status(400).json({ error: { message: 'Email is required', requestId: req.requestId } });
      return;
    }

    if (!validatePassword(password)) {
      res.status(400).json({ error: { message: 'Password does not meet complexity rules', requestId: req.requestId } });
      return;
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: normalizedUsername },
          { email: normalizedEmail }
        ]
      }
    });
    if (existingUser) {
      res.status(409).json({ error: { message: existingUser.username === normalizedUsername ? 'Username already exists' : 'Email already registered', requestId: req.requestId } });
      return;
    }

    const now = new Date();
    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash: await hashPassword(password),
        fullName,
        phone,
        createdAt: now,
        updatedAt: now
      }
    });

    const token = signToken({ id: user.id, role: user.role, username: user.username });
    await writeAudit({ actorId: user.id, action: 'REGISTER', targetEntity: 'User', targetId: user.id, outcome: 'SUCCESS' });

    res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (error) {
    next(error);
  }
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const input = String(req.body.username ?? '').trim();
    const normalizedInput = input.toLowerCase();
    const password = String(req.body.password ?? '');

    // Allow login by either username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: normalizedInput },
          { email: normalizedInput }
        ]
      }
    });

    if (!user || !(await comparePassword(password, user.passwordHash))) {
      await writeAudit({ action: 'LOGIN', targetEntity: 'User', targetId: user?.id, outcome: 'FAILED', metadata: { input: normalizedInput } });
      res.status(401).json({ error: { message: 'Invalid credentials', requestId: req.requestId } });
      return;
    }

    await writeAudit({ actorId: user.id, action: 'LOGIN', targetEntity: 'User', targetId: user.id, outcome: 'SUCCESS' });
    const token = signToken({ id: user.id, role: user.role, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
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
    res.json({ id: user.id, username: user.username, email: user.email, role: user.role, fullName: user.fullName, phone: user.phone });
  } catch (error) {
    next(error);
  }
});

export default router;
