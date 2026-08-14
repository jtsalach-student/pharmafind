import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, HeartPulse, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getRoleDashboard, normalizeRoleInput, setSession, type UserRole } from '../lib/auth';
import { api } from '../lib/api';

const validRoles = ['USER', 'PHARMACIST', 'PHARMACY_ADMIN', 'DRIVER', 'SYSTEM_ADMIN'] as const;

const registerSchema = z
  .object({
    username: z.string().trim().min(3, 'Username must be at least 3 characters').regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and dashes'),
    fullName: z.string().trim().min(2, 'Full name is required').refine((value) => value.split(/\s+/).length >= 2, 'Enter at least first and last name'),
    email: z.string().trim().email('Enter a valid email'),
    phone: z.string().trim().regex(/^\+233[2,3,5,6,7,8,9][0-9]{8}$/, 'Enter a valid Ghana phone number'),
    role: z.custom<UserRole>((value) => {
      const normalized = normalizeRoleInput(typeof value === 'string' ? value : '');
      return normalized !== null && validRoles.includes(normalized);
    }, 'Select a valid role'),
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

type RegisterForm = z.infer<typeof registerSchema>;

// Rate limiting: max 5 attempts per 30 seconds
const SIGNUP_ATTEMPT_LIMIT = 5;
const SIGNUP_ATTEMPT_WINDOW_MS = 30 * 1000; // 30 seconds

export function RegisterPage() {
  const navigate = useNavigate();
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const submitLockRef = useRef(false);
  const signupAttemptTimestamps = useRef<number[]>([]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const getSignupErrorMessage = (error: any) => {
    const rawMessage = String(error?.message || error?.error_description || error?.details || error || 'Unable to create your account right now.');
    const lowerMessage = rawMessage.toLowerCase();

    if (/user already registered|already registered|email.*already.*used|already exists|duplicate.*email|duplicate key/i.test(lowerMessage)) {
      return 'User already registered';
    }

    if (/rate limit|too many requests|429/i.test(lowerMessage)) {
      return 'Supabase rate limit. Please wait a moment and try again.';
    }

    return rawMessage;
  };

  const isSubmitPending = isSubmitting || submitLockRef.current;

  const onSubmit = async (values: RegisterForm) => {
    if (submitLockRef.current || isSubmitting) {
      console.warn('[Signup] Blocked duplicate submit attempt', {
        submitLocked: submitLockRef.current,
        isSubmitting,
        email: values.email,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const now = Date.now();

    signupAttemptTimestamps.current = signupAttemptTimestamps.current.filter(
      (timestamp) => now - timestamp < SIGNUP_ATTEMPT_WINDOW_MS
    );

    const recentAttempts = signupAttemptTimestamps.current.length;
    console.info('[Signup] signup started', {
      recentAttempts,
      limit: SIGNUP_ATTEMPT_LIMIT,
      email: values.email,
      role: values.role,
      timestamp: new Date(now).toISOString()
    });

    if (recentAttempts >= SIGNUP_ATTEMPT_LIMIT) {
      const oldestAttempt = signupAttemptTimestamps.current[0];
      const timeUntilReset = oldestAttempt + SIGNUP_ATTEMPT_WINDOW_MS - now;
      const secondsUntilReset = Math.ceil(timeUntilReset / 1000);

      setStatusMessage({
        type: 'error',
        text: `Too many signup attempts. Please wait ${secondsUntilReset} seconds and try again.`
      });

      console.warn('[Signup] rate limit triggered', {
        attemptCount: recentAttempts,
        windowSeconds: SIGNUP_ATTEMPT_WINDOW_MS / 1000,
        secondsUntilReset,
        timestamp: new Date().toISOString()
      });
      return;
    }

    signupAttemptTimestamps.current.push(now);

    try {
      submitLockRef.current = true;
      setStatusMessage(null);

      const response = await api.post('/auth/register', {
        username: values.username.trim().toLowerCase(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
        fullName: values.fullName,
        phone: values.phone,
        role: values.role
      });

      const { token, user } = response.data as {
        token: string;
        user: { id?: string; username?: string; email?: string; role?: UserRole | string };
      };

      if (!token) {
        throw new Error('The server did not return an auth token.');
      }

      if (!user?.id) {
        throw new Error('The server did not return a user ID.');
      }

      const role = normalizeRoleInput((user?.role as UserRole | string | undefined) ?? values.role);
      setSession(token, {
        id: user.id,
        name: values.fullName,
        email: user?.email || values.email,
        role: role ?? values.role
      });

      setStatusMessage({
        type: 'success',
        text: 'Account created successfully.'
      });

      navigate(getRoleDashboard(role ?? values.role), { replace: true });
    } catch (error: any) {
      const errorMessage = error?.response?.data?.error?.message || getSignupErrorMessage(error);

      console.error('[Signup] signup error caught', {
        errorMessage,
        status: error?.status,
        response: error?.response?.data,
        timestamp: new Date().toISOString()
      });

      setStatusMessage({
        type: 'error',
        text: errorMessage
      });
    } finally {
      submitLockRef.current = false;
      console.info('[Signup] signup finished', {
        timestamp: new Date().toISOString(),
        isSubmitPending: false
      });
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-7xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid w-full overflow-hidden rounded-[32px] border border-slate-200 bg-white/80 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:grid-cols-[0.82fr_1.18fr]">
        <motion.section
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-gradient-to-br from-slate-900 via-sky-900 to-sky-700 p-6 text-white sm:p-8 lg:p-10"
        >
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                <HeartPulse className="h-6 w-6" />
              </div>
              <div>
                <div className="text-2xl font-black tracking-tight">PharmaFind</div>
                <div className="text-xs uppercase tracking-[0.2em] text-sky-100">Join the network</div>
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Create a better healthcare routine.</h1>
              <p className="max-w-md text-base text-sky-100">
                Sign up to discover trusted medicines, schedule delivery, and access local pharmacy support from anywhere.
              </p>
            </div>

            <div className="space-y-3 rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
              {[
                'Secure digital onboarding',
                'Prescription-aware ordering',
                'Smart route and delivery tracking'
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-medium text-sky-50">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {item}
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
                <div className="text-[10px] uppercase tracking-[0.2em] text-sky-100">Access</div>
                <div className="mt-2 text-2xl font-black">8k+</div>
                <div className="text-sm text-sky-100">Verified users</div>
              </div>
              <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
                <div className="text-[10px] uppercase tracking-[0.2em] text-sky-100">Support</div>
                <div className="mt-2 text-2xl font-black">24/7</div>
                <div className="text-sm text-sky-100">Medical response</div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="p-6 sm:p-8 lg:p-10"
        >
          <div className="mb-8 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Create account</div>
              <h2 className="mt-2 text-3xl font-black text-slate-900">Sign up</h2>
            </div>
            <Link to="/login" className="secondary-button px-3 py-2 text-xs">Have an account?</Link>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="mb-2 block text-sm font-semibold text-slate-700">Full Name</label>
              <input id="fullName" className="input-shell" {...register('fullName')} aria-invalid={!!errors.fullName} />
              {errors.fullName && <p className="mt-2 text-sm text-red-600">{errors.fullName.message}</p>}
            </div>

            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-semibold text-slate-700">Username</label>
              <input id="username" className="input-shell" placeholder="letters, numbers, dash, underscore" {...register('username')} aria-invalid={!!errors.username} />
              {errors.username && <p className="mt-2 text-sm text-red-600">{errors.username.message}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
                <input id="email" type="email" className="input-shell" {...register('email')} aria-invalid={!!errors.email} />
                {errors.email && <p className="mt-2 text-sm text-red-600">{errors.email.message}</p>}
              </div>

              <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-slate-700">Phone number</label>
                <input id="phone" className="input-shell" {...register('phone')} aria-invalid={!!errors.phone} />
                {errors.phone && <p className="mt-2 text-sm text-red-600">{errors.phone.message}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="role" className="mb-2 block text-sm font-semibold text-slate-700">Role</label>
              <select id="role" className="input-shell" {...register('role')} aria-invalid={!!errors.role} defaultValue="USER">
                <option value="USER">Patient</option>
                <option value="PHARMACIST">Pharmacist</option>
                <option value="PHARMACY_ADMIN">Pharmacy Admin</option>
                <option value="DRIVER">Driver</option>
                <option value="SYSTEM_ADMIN">System Admin</option>
              </select>
              {errors.role && <p className="mt-2 text-sm text-red-600">{errors.role.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
              <input id="password" type="password" className="input-shell" {...register('password')} aria-invalid={!!errors.password} />
              {errors.password && <p className="mt-2 text-sm text-red-600">{errors.password.message}</p>}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-sm font-semibold text-slate-700">Confirm Password</label>
              <input id="confirmPassword" type="password" className="input-shell" {...register('confirmPassword')} aria-invalid={!!errors.confirmPassword} />
              {errors.confirmPassword && <p className="mt-2 text-sm text-red-600">{errors.confirmPassword.message}</p>}
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              Passwords are validated securely before account creation.
            </div>

            {statusMessage && (
              <div className={`rounded-2xl border px-3 py-2 text-sm ${statusMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {statusMessage.text}
              </div>
            )}

            <button type="submit" disabled={isSubmitPending} className="primary-button w-full disabled:cursor-not-allowed disabled:opacity-70">
              {isSubmitPending ? 'Creating account...' : 'Create Account'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </form>
        </motion.section>
      </div>
    </main>
  );
}
