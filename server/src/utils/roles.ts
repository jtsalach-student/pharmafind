export const DB_ROLE_VALUES = ['USER', 'PHARMACIST', 'PHARMACY_ADMIN', 'DRIVER', 'SYSTEM_ADMIN'] as const;

export type DbRole = (typeof DB_ROLE_VALUES)[number];

export const LEGACY_ROLE_MAP: Record<string, DbRole> = {
  patient: 'USER',
  pharmacist: 'PHARMACIST',
  hospital_staff: 'PHARMACY_ADMIN',
  hospitalstaff: 'PHARMACY_ADMIN',
  driver: 'DRIVER',
  admin: 'SYSTEM_ADMIN'
};

export const normalizeRoleInput = (role: string | DbRole | null | undefined): DbRole | null => {
  if (!role) {
    return null;
  }

  const value = String(role).trim();
  if (DB_ROLE_VALUES.includes(value as DbRole)) {
    return value as DbRole;
  }

  return LEGACY_ROLE_MAP[value.toLowerCase()] ?? null;
};

export const isValidRole = (role: unknown): role is DbRole => normalizeRoleInput(typeof role === 'string' ? role : '') !== null;
