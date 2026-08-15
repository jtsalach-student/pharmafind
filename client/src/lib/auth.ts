export const ROLE_VALUES = ['USER', 'PHARMACIST', 'DRIVER', 'SYSTEM_ADMIN'] as const;

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
  user: 'USER',
  pharmacist: 'PHARMACIST',
  pharmacy_admin: 'PHARMACIST',
  pharmacy: 'PHARMACIST',
  driver: 'DRIVER',
  admin: 'SYSTEM_ADMIN',
  system_admin: 'SYSTEM_ADMIN',
  system: 'SYSTEM_ADMIN'
};

export const normalizeRoleInput = (role: string | UserRole | null | undefined, usernameOrEmail?: string): UserRole | null => {
  if (!role && !usernameOrEmail) {
    return null;
  }

  const raw = String(role ?? '').trim().toUpperCase();
  const ident = String(usernameOrEmail ?? '').trim().toLowerCase();

  // Admin roles & accounts
  if (
    raw === 'SYSTEM_ADMIN' ||
    raw === 'ADMIN' ||
    raw === 'SYSTEM' ||
    raw === 'PHARMACY_ADMIN' ||
    ident.includes('admin') ||
    ident === 'campusadmin'
  ) {
    return 'SYSTEM_ADMIN';
  }

  // Pharmacist roles & accounts
  if (raw === 'PHARMACIST' || raw === 'PHARMACY' || ident.includes('pharmacist') || ident.includes('pharma')) {
    return 'PHARMACIST';
  }

  // Driver roles & accounts
  if (raw === 'DRIVER' || ident.includes('driver')) {
    return 'DRIVER';
  }

  // Patient / standard user
  if (raw === 'USER' || raw === 'PATIENT') {
    return 'USER';
  }

  const mapped = LEGACY_ROLE_MAP[String(role).trim().toLowerCase()];
  return mapped ?? 'USER';
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
  DRIVER: '/driver',
  SYSTEM_ADMIN: '/admin'
};

export const createDemoSessionFromEmail = (email: string, role?: UserRole): UserSession => {
  const normalized = email.trim().toLowerCase();
  const resolvedRole = normalizeRoleInput(role ?? 'USER') ?? 'USER';

  if (role) {
    return {
      id: `demo-${normalized.replace(/[^a-z0-9]/g, '-')}-${resolvedRole.toLowerCase()}`,
      name: resolvedRole === 'PHARMACIST'
        ? 'Pharmacist User'
        : resolvedRole === 'DRIVER'
          ? 'Driver User'
          : resolvedRole === 'SYSTEM_ADMIN'
            ? 'System Admin'
            : 'User',
      email,
      role: resolvedRole
    };
  }

  if (normalized.includes('admin') || normalized.includes('system')) {
    return { id: `demo-${normalized.replace(/[^a-z0-9]/g, '-')}-admin`, name: 'System Admin', email, role: 'SYSTEM_ADMIN' };
  }

  if (normalized.includes('pharmacist') || normalized.includes('pharmacy')) {
    return { id: `demo-${normalized.replace(/[^a-z0-9]/g, '-')}-pharmacist`, name: 'Pharmacist User', email, role: 'PHARMACIST' };
  }

  if (normalized.includes('driver')) {
    return { id: `demo-${normalized.replace(/[^a-z0-9]/g, '-')}-driver`, name: 'Driver User', email, role: 'DRIVER' };
  }

  return { id: `demo-${normalized.replace(/[^a-z0-9]/g, '-')}-user`, name: 'User', email, role: 'USER' };
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
    const normalizedRole = normalizeRoleInput(parsed.role ?? 'USER', parsed.name || parsed.email);

    if (!normalizedRole) {
      return null;
    }

    const userSession: UserSession = {
      id: parsed.id ?? '',
      name: parsed.name ?? 'User',
      email: parsed.email ?? '',
      role: normalizedRole
    };

    if (parsed.role !== normalizedRole) {
      localStorage.setItem(userKey, JSON.stringify(userSession));
    }

    return userSession;
  } catch {
    return null;
  }
};

export const setSession = (token: string, user: UserSession): void => {
  const normalizedRole = normalizeRoleInput(user.role, user.name || user.email) ?? 'USER';
  localStorage.setItem(tokenKey, token);
  localStorage.setItem(userKey, JSON.stringify({ ...user, role: normalizedRole }));
};

export const setToken = (token: string): void => localStorage.setItem(tokenKey, token);
export const clearToken = (): void => localStorage.removeItem(tokenKey);
export const clearSession = (): void => {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
};
