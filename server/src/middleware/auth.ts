import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { verifyToken } from '../utils/auth.js';

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: { message: 'Unauthorized', requestId: req.requestId } });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.id, role: payload.role as Role, username: payload.username };
    next();
  } catch {
    res.status(401).json({ error: { message: 'Invalid token', requestId: req.requestId } });
  }
};

export const requireRoles = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthorized', requestId: req.requestId } });
    return;
  }
  if (!roles.includes(req.user.role)) {
    res.status(403).json({ error: { message: 'Forbidden', requestId: req.requestId } });
    return;
  }
  next();
};
