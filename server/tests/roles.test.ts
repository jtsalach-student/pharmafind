import { describe, expect, it } from 'vitest';
import { isValidRole, normalizeRoleInput } from '../src/utils/roles.js';

describe('role validation', () => {
  it('normalizes legacy lowercase roles to database enum values', () => {
    expect(normalizeRoleInput('patient')).toBe('USER');
    expect(normalizeRoleInput('pharmacist')).toBe('PHARMACIST');
    expect(normalizeRoleInput('hospital_staff')).toBe('PHARMACY_ADMIN');
    expect(normalizeRoleInput('driver')).toBe('DRIVER');
    expect(normalizeRoleInput('admin')).toBe('SYSTEM_ADMIN');
  });

  it('accepts only enum values and rejects invalid submissions', () => {
    expect(isValidRole('USER')).toBe(true);
    expect(isValidRole('PHARMACIST')).toBe(true);
    expect(isValidRole('PHARMACY_ADMIN')).toBe(true);
    expect(isValidRole('DRIVER')).toBe(true);
    expect(isValidRole('SYSTEM_ADMIN')).toBe(true);
    expect(isValidRole('patient')).toBe(true);
    expect(isValidRole('hospitalstaff')).toBe(true);
    expect(isValidRole('superuser')).toBe(false);
    expect(isValidRole('')).toBe(false);
  });
});
