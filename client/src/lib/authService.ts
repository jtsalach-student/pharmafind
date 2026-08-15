import bcrypt from 'bcryptjs';
import { getSupabaseClient } from './supabase';
import {
  normalizeRoleInput,
  setSession,
  type UserRole,
  type UserSession
} from './auth';
import { api } from './api';

export interface LoginParams {
  usernameOrEmail: string;
  password: string;
}

export interface RegisterParams {
  username: string;
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  role?: UserRole | string;
}

export interface AuthResult {
  token: string;
  user: UserSession;
}

/**
 * Generate a client-safe session token for Supabase direct authentication
 */
function createClientToken(userId: string, role: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      id: userId,
      role,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
    })
  );
  const sig = btoa(`${userId}-${Date.now()}`);
  return `${header}.${payload}.${sig}`;
}

/**
 * Authenticate user via Backend API if configured, with Supabase Direct fallback
 */
export async function loginUser(params: LoginParams): Promise<AuthResult> {
  const input = params.usernameOrEmail.trim();
  const normalizedInput = input.toLowerCase();
  const password = params.password;

  const externalApiConfigured = Boolean(
    import.meta.env.VITE_API_BASE_URL &&
    String(import.meta.env.VITE_API_BASE_URL).trim().length > 0 &&
    !String(import.meta.env.VITE_API_BASE_URL).startsWith('/')
  );

  // 1. If an external API URL is explicitly configured, try backend API first
  if (externalApiConfigured) {
    try {
      const response = await api.post('/auth/login', {
        username: input,
        password
      });

      const { token, user } = response.data as {
        token: string;
        user: { id?: string; username?: string; email?: string; role?: UserRole | string; fullName?: string };
      };

      if (token && user?.id) {
        const role = normalizeRoleInput(user.role ?? 'USER') ?? 'USER';
        const session: UserSession = {
          id: user.id,
          name: user.fullName || user.username || input,
          email: user.email || input,
          role
        };
        setSession(token, session);
        return { token, user: session };
      }
    } catch (backendError: any) {
      const status = backendError?.response?.status;
      // If it's a 401 invalid credentials from a live server, don't fall back
      if (status === 401) {
        const msg = backendError?.response?.data?.error?.message || 'Invalid credentials';
        throw new Error(msg);
      }
      console.warn('[AuthService] Backend login unavailable or failed, falling back to Supabase direct auth:', backendError?.message);
    }
  }

  // 2. Direct Supabase Database Authentication
  const supabase = getSupabaseClient();

  // Look up user by username or email
  const { data: userRecords, error: dbError } = await supabase
    .from('User')
    .select('id, username, email, passwordHash, role, fullName, phone')
    .or(`username.ilike.${normalizedInput},email.ilike.${normalizedInput}`)
    .limit(1);

  if (dbError) {
    console.error('[AuthService] Supabase user query error:', dbError);
  }

  const user = userRecords && userRecords.length > 0 ? userRecords[0] : null;

  if (user && user.passwordHash) {
    let passwordMatches = false;
    try {
      passwordMatches = await bcrypt.compare(password, user.passwordHash);
    } catch (cmpErr) {
      console.warn('[AuthService] bcrypt comparison error:', cmpErr);
      // Fallback for plain-text or legacy test hashes
      passwordMatches = user.passwordHash === password;
    }

    if (!passwordMatches) {
      throw new Error('Invalid username or password.');
    }

    const role = normalizeRoleInput(user.role) ?? 'USER';
    const token = createClientToken(user.id, role);
    const session: UserSession = {
      id: user.id,
      name: user.fullName || user.username,
      email: user.email,
      role
    };

    setSession(token, session);
    return { token, user: session };
  }

  // 3. Try Supabase Auth built-in
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedInput,
      password
    });

    if (!authError && authData.user) {
      const role = normalizeRoleInput((authData.user.user_metadata?.role as string) ?? 'USER') ?? 'USER';
      const token = authData.session?.access_token || createClientToken(authData.user.id, role);
      const session: UserSession = {
        id: authData.user.id,
        name: authData.user.user_metadata?.full_name || authData.user.email || input,
        email: authData.user.email || input,
        role
      };
      setSession(token, session);
      return { token, user: session };
    }
  } catch {
    // Supabase auth failed or not configured for this user
  }

  throw new Error('Invalid username or password.');
}

/**
 * Register a new user via Backend API if configured, with Supabase Direct fallback
 */
export async function registerUser(params: RegisterParams): Promise<AuthResult> {
  const normalizedUsername = params.username.trim().toLowerCase();
  const normalizedEmail = params.email.trim().toLowerCase();
  const rawRole = normalizeRoleInput(params.role ?? 'USER') ?? 'USER';

  const externalApiConfigured = Boolean(
    import.meta.env.VITE_API_BASE_URL &&
    String(import.meta.env.VITE_API_BASE_URL).trim().length > 0 &&
    !String(import.meta.env.VITE_API_BASE_URL).startsWith('/')
  );

  // 1. Try backend API first if configured
  if (externalApiConfigured) {
    try {
      const response = await api.post('/auth/register', {
        username: normalizedUsername,
        email: normalizedEmail,
        password: params.password,
        fullName: params.fullName,
        phone: params.phone,
        role: rawRole
      });

      const { token, user } = response.data as {
        token: string;
        user: { id?: string; username?: string; email?: string; role?: UserRole | string };
      };

      if (token && user?.id) {
        const session: UserSession = {
          id: user.id,
          name: params.fullName || user.username || normalizedUsername,
          email: user.email || normalizedEmail,
          role: rawRole
        };
        setSession(token, session);
        return { token, user: session };
      }
    } catch (backendError: any) {
      const status = backendError?.response?.status;
      if (status === 409 || status === 400) {
        const msg = backendError?.response?.data?.error?.message || 'Registration failed.';
        throw new Error(msg);
      }
      console.warn('[AuthService] Backend register unavailable, falling back to Supabase direct:', backendError?.message);
    }
  }

  // 2. Direct Supabase Database Registration
  const supabase = getSupabaseClient();

  // Check if username or email already exists
  const { data: existingUsers } = await supabase
    .from('User')
    .select('id, username, email')
    .or(`username.ilike.${normalizedUsername},email.ilike.${normalizedEmail}`)
    .limit(1);

  if (existingUsers && existingUsers.length > 0) {
    const existing = existingUsers[0];
    if (existing.username?.toLowerCase() === normalizedUsername) {
      throw new Error('Username is already taken.');
    }
    throw new Error('An account with this email already exists.');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(params.password, 10);
  const now = new Date().toISOString();

  // Generate ID
  const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const { data: insertedUser, error: insertError } = await supabase
    .from('User')
    .insert({
      id: userId,
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
      fullName: params.fullName || normalizedUsername,
      phone: params.phone || null,
      role: rawRole,
      createdAt: now,
      updatedAt: now
    })
    .select('id, username, email, role, fullName')
    .single();

  if (insertError) {
    console.error('[AuthService] Failed to insert user into Supabase:', insertError);
    throw new Error(insertError.message || 'Failed to create user account.');
  }

  const token = createClientToken(insertedUser.id, rawRole);
  const session: UserSession = {
    id: insertedUser.id,
    name: insertedUser.fullName || insertedUser.username,
    email: insertedUser.email,
    role: rawRole
  };

  setSession(token, session);
  return { token, user: session };
}
