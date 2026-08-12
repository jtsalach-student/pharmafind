import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export const validatePassword = (password: string): boolean => passwordRegex.test(password);

export const hashPassword = async (password: string): Promise<string> => bcrypt.hash(password, 10);

export const comparePassword = async (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

export const signToken = (payload: { id: string; role: string; username: string }): string =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });

export const verifyToken = (token: string): { id: string; role: string; username: string } =>
  jwt.verify(token, env.JWT_SECRET) as { id: string; role: string; username: string };
