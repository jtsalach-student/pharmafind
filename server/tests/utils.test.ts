import { describe, expect, it } from 'vitest';
import { DeliveryStatus, Role } from '@prisma/client';
import { emergencyScore } from '../src/utils/emergency.js';
import { haversineDistanceKm } from '../src/utils/geo.js';
import { validatePassword, hashPassword, comparePassword, signToken, verifyToken } from '../src/utils/auth.js';
import { canTransitionDelivery, canDriverUpdateGps } from '../src/utils/workflows.js';
import { shouldMarkPaidFromWebhook } from '../src/utils/payment.js';

describe('emergency scoring boundaries', () => {
  it('scores by stock/open/distance bands', () => {
    expect(emergencyScore(0, false, 4)).toBe(20);
    expect(emergencyScore(3, true, 0.2)).toBe(220);
    expect(emergencyScore(10, true, 1.5)).toBe(200);
    expect(emergencyScore(20, true, 2.5)).toBe(200);
  });
});

describe('haversine', () => {
  it('calculates expected distance around Legon', () => {
    const distance = haversineDistanceKm(5.6501, -0.1869, 5.6661, -0.2034);
    expect(distance).toBeGreaterThan(2);
    expect(distance).toBeLessThan(3);
  });
});

describe('authentication utilities', () => {
  it('validates password policy', () => {
    expect(validatePassword('weak')).toBe(false);
    expect(validatePassword('Strong123!')).toBe(true);
  });

  it('hashes and compares password', async () => {
    const hash = await hashPassword('Strong123!');
    expect(await comparePassword('Strong123!', hash)).toBe(true);
  });

  it('signs and verifies jwt', () => {
    const token = signToken({ id: 'u1', role: 'USER', username: 'testuser' });
    const payload = verifyToken(token);
    expect(payload.id).toBe('u1');
  });
});

describe('workflow rules', () => {
  it('checks delivery transitions', () => {
    expect(canTransitionDelivery(DeliveryStatus.REQUESTED, DeliveryStatus.ASSIGNED)).toBe(true);
    expect(canTransitionDelivery(DeliveryStatus.REQUESTED, DeliveryStatus.COMPLETED)).toBe(false);
  });

  it('authorizes gps updates correctly', () => {
    expect(canDriverUpdateGps(Role.DRIVER, 'd1', 'd1', DeliveryStatus.ASSIGNED)).toBe(true);
    expect(canDriverUpdateGps(Role.DRIVER, 'd1', 'd2', DeliveryStatus.ASSIGNED)).toBe(false);
    expect(canDriverUpdateGps(Role.USER, 'd1', 'd1', DeliveryStatus.ASSIGNED)).toBe(false);
  });
});

describe('payment webhook idempotency', () => {
  it('allows paid transition once', () => {
    expect(shouldMarkPaidFromWebhook('PENDING', 'success')).toBe(true);
    expect(shouldMarkPaidFromWebhook('PAID', 'success')).toBe(false);
  });
});
