export const ROLE_VALUES = ['USER', 'PHARMACIST', 'PHARMACY_ADMIN', 'DRIVER', 'SYSTEM_ADMIN'] as const;

export type UserRole = (typeof ROLE_VALUES)[number];

export type UserSession = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export const tokenKey = 'pharmafind_token';
export const userKey = 'pharmafind_user';

const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  patient: 'USER',
  pharmacist: 'PHARMACIST',
  driver: 'DRIVER',
  admin: 'SYSTEM_ADMIN'
};

export const normalizeRoleInput = (role: string | UserRole | null | undefined): UserRole | null => {
  if (!role) {
    return null;
  }

  const value = String(role).trim();
  if (ROLE_VALUES.includes(value as UserRole)) {
    return value as UserRole;
  }

  const mapped = LEGACY_ROLE_MAP[value.toLowerCase()];
  return mapped ?? null;
};

export const isValidRole = (role: unknown): role is UserRole => {
  if (typeof role !== 'string') {
    return false;
  }

  return normalizeRoleInput(role) !== null;
};

export const roleDashboardMap: Record<UserRole, string> = {
  USER: '/dashboard',
  PHARMACIST: '/pharmacist',
  PHARMACY_ADMIN: '/admin',
  DRIVER: '/driver',
  SYSTEM_ADMIN: '/admin'
};

export const createDemoSessionFromEmail = (email: string, role?: UserRole): UserSession => {
  const normalized = email.trim().toLowerCase();
  const resolvedRole = normalizeRoleInput(role ?? 'USER');

  if (role) {
    return {
      id: `demo-${normalized.replace(/[^a-z0-9]/g, '-')}-${resolvedRole.toLowerCase()}`,
      name: resolvedRole === 'PHARMACY_ADMIN'
        ? 'Pharmacy Admin User'
        : resolvedRole === 'PHARMACIST'
          ? 'Pharmacist User'
          : resolvedRole === 'DRIVER'
            ? 'Driver User'
            : resolvedRole === 'SYSTEM_ADMIN'
              ? 'Admin User'
              : 'Patient User',
      email,
      role: resolvedRole
    };
  }

  if (normalized.includes('admin')) {
    return { id: `demo-${normalized.replace(/[^a-z0-9]/g, '-')}-admin`, name: 'Admin User', email, role: 'SYSTEM_ADMIN' };
  }

  if (normalized.includes('pharmacist')) {
    return { id: `demo-${normalized.replace(/[^a-z0-9]/g, '-')}-pharmacist`, name: 'Pharmacist User', email, role: 'PHARMACIST' };
  }

  if (normalized.includes('driver')) {
    return { id: `demo-${normalized.replace(/[^a-z0-9]/g, '-')}-driver`, name: 'Driver User', email, role: 'DRIVER' };
  }

  if (normalized.includes('pharmacy')) {
    return { id: `demo-${normalized.replace(/[^a-z0-9]/g, '-')}-pharmacy-admin`, name: 'Pharmacy Admin User', email, role: 'PHARMACY_ADMIN' };
  }

  return { id: `demo-${normalized.replace(/[^a-z0-9]/g, '-')}-user`, name: 'Patient User', email, role: 'USER' };
};

export const getRoleDashboard = (role: UserRole): string => roleDashboardMap[role] ?? '/dashboard';

export const getToken = (): string | null => localStorage.getItem(tokenKey);
export const getUser = (): UserSession | null => {
  const raw = localStorage.getItem(userKey);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UserSession>;
    const normalizedRole = normalizeRoleInput(parsed.role ?? 'USER');

    if (!normalizedRole) {
      return null;
    }

    return {
      id: parsed.id ?? '',
      name: parsed.name ?? 'User',
      email: parsed.email ?? '',
      role: normalizedRole
    };
  } catch {
    return null;
  }
};

export const setSession = (token: string, user: UserSession): void => {
  const normalizedRole = normalizeRoleInput(user.role) ?? 'USER';
  localStorage.setItem(tokenKey, token);
  localStorage.setItem(userKey, JSON.stringify({ ...user, role: normalizedRole }));
};

export const setToken = (token: string): void => localStorage.setItem(tokenKey, token);
export const clearToken = (): void => localStorage.removeItem(tokenKey);
export const clearSession = (): void => {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
};
