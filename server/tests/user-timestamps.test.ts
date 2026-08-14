import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

describe('User Table Timestamps', () => {
  let testUserId: string;

  beforeAll(async () => {
    // Clean up any previous test data
    await prisma.user.deleteMany({ where: { username: { startsWith: 'test_timestamp_' } } });
  });

  afterAll(async () => {
    // Clean up test data
    if (testUserId) {
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  it('should create a User with both createdAt and updatedAt timestamps', async () => {
    const now = new Date();
    const user = await prisma.user.create({
      data: {
        username: `test_timestamp_${Date.now()}`,
        email: `test_timestamp_${Date.now()}@test.local`,
        passwordHash: 'hashedpassword123',
        fullName: 'Test User',
        phone: '+2332012345678',
        role: Role.USER,
        createdAt: now,
        updatedAt: now
      }
    });

    testUserId = user.id;

    expect(user.id).toBeDefined();
    expect(user.username).toBe(`test_timestamp_${Date.now()}`);
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();
    expect(user.createdAt instanceof Date).toBe(true);
    expect(user.updatedAt instanceof Date).toBe(true);
    expect(user.role).toBe(Role.USER);
  });

  it('should retrieve User with all timestamp fields populated', async () => {
    if (!testUserId) {
      throw new Error('testUserId not set');
    }

    const user = await prisma.user.findUnique({ where: { id: testUserId } });

    expect(user).toBeDefined();
    expect(user?.createdAt).toBeDefined();
    expect(user?.updatedAt).toBeDefined();
    expect(user?.createdAt).not.toBeNull();
    expect(user?.updatedAt).not.toBeNull();
  });

  it('should handle User creation without explicit timestamps (database defaults)', async () => {
    const username = `test_timestamp_noexplicit_${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        username,
        email: `${username}@test.local`,
        passwordHash: 'hashedpassword456',
        role: Role.USER
      }
    });

    try {
      expect(user.id).toBeDefined();
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
      // Verify database has these values set
      const retrieved = await prisma.user.findUnique({ where: { id: user.id } });
      expect(retrieved?.createdAt).not.toBeNull();
      expect(retrieved?.updatedAt).not.toBeNull();
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('should update User and verify updatedAt changes via trigger', async () => {
    if (!testUserId) {
      throw new Error('testUserId not set');
    }

    const userBefore = await prisma.user.findUnique({ where: { id: testUserId } });
    expect(userBefore).toBeDefined();

    // Wait a bit to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    const userAfter = await prisma.user.update({
      where: { id: testUserId },
      data: { fullName: 'Updated Test User' }
    });

    expect(userAfter.createdAt).toEqual(userBefore!.createdAt);
    expect(userAfter.updatedAt.getTime()).toBeGreaterThan(userBefore!.updatedAt.getTime());
  });
});
