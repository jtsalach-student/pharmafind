import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, HeartPulse, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getUser, getRoleDashboard, normalizeRoleInput, setSession, type UserSession, type UserRole } from '../lib/auth';
import { getSupabaseClient } from '../lib/supabase';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const navigate = useNavigate();
  const user = getUser();

  useEffect(() => {
    if (user) {
      navigate(getRoleDashboard(user.role), { replace: true });
    }
  }, [navigate, user]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginForm) => {
    try {
      setStatusMessage(null);
      const client = getSupabaseClient();
      console.info('[Supabase] login request', {
        email: values.email,
        origin: window.location.origin
      });

      const { data, error } = await client.auth.signInWithPassword({
        email: values.email,
        password: values.password
      });

      console.info('[Supabase] login response', data);

      if (error) {
        console.error('[Supabase] login auth error', error);
        throw error;
      }

      const authUser = data.user;
      if (!authUser) {
        throw new Error('Supabase did not return an authenticated user.');
      }

      if (!authUser.email_confirmed_at) {
        await client.auth.signOut();
        throw new Error('Please verify your email before signing in.');
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error('Supabase did not return an authenticated session.');
      }

      const role = normalizeRoleInput((authUser.user_metadata?.role as UserRole | string | undefined) ?? 'USER');
      const session: UserSession = {
        name: authUser.user_metadata?.full_name || authUser.email || values.email,
        email: authUser.email || values.email,
        role
      };

      setSession(accessToken, session);
      setStatusMessage({ type: 'success', text: 'Signed in successfully.' });
      navigate(getRoleDashboard(role), { replace: true });
    } catch (error: any) {
      console.error('[Supabase] login failure', {
        name: error?.name,
        message: error?.message,
        status: error?.status,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        error_description: error?.error_description
      });

      const message = error?.message || error?.error_description || 'Unable to sign in. Please check your credentials.';
      setStatusMessage({ type: 'error', text: message });
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-7xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid w-full overflow-hidden rounded-[32px] border border-slate-200 bg-white/70 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:grid-cols-[1.15fr_0.85fr]">
        <motion.section
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden bg-gradient-to-br from-sky-600 via-cyan-500 to-emerald-500 p-6 text-white sm:p-8 lg:p-10"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.25),transparent_30%)]" aria-hidden="true" />
          <div className="relative space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30">
                <HeartPulse className="h-6 w-6" />
              </div>
              <div>
                <div className="text-2xl font-black tracking-tight">PharmaFind</div>
                <div className="text-xs uppercase tracking-[0.2em] text-sky-100">Healthcare access</div>
              </div>
            </div>

            <div className="rounded-[28px] bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-medium text-sky-100">Live platform overview</div>
                <div className="rounded-full bg-emerald-400/30 px-2.5 py-1 text-xs font-semibold text-emerald-50">+12.4%</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/10 p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-sky-100">Orders</div>
                  <div className="mt-2 text-2xl font-black">3.4k</div>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-sky-100">Avg ETA</div>
                  <div className="mt-2 text-2xl font-black">15m</div>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-sky-100">Care</div>
                  <div className="mt-2 text-2xl font-black">24/7</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h1 className="max-w-md text-3xl font-black tracking-tight sm:text-4xl">
                Smarter access to medicines and local healthcare.
              </h1>
              <p className="max-w-md text-base text-sky-100">
                Connect patients with verified pharmacies, fast prescription support, and emergency delivery assistance in real time.
              </p>
            </div>

            <div className="space-y-3">
              {[
                'Verified pharmacy inventory',
                'Prescription-aware delivery checks',
                'Emergency medication routing'
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-medium text-sky-50">
                  <div className="rounded-full bg-white/15 p-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </div>
                  {item}
                </div>
              ))}
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
              <div className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Welcome back</div>
              <h2 className="mt-2 text-3xl font-black text-slate-900">Login</h2>
            </div>
            <Link to="/" className="secondary-button px-3 py-2 text-xs">Back home</Link>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
              <input id="email" type="email" className="input-shell" {...register('email')} aria-invalid={!!errors.email} />
              {errors.email && <p className="mt-2 text-sm text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</label>
                <button type="button" onClick={() => setShowPassword((s) => !s)} className="text-xs font-semibold text-sky-600 hover:text-sky-700" aria-label="Toggle password visibility">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="relative">
                <input id="password" type={showPassword ? 'text' : 'password'} className="input-shell pr-12" {...register('password')} aria-invalid={!!errors.password} />
                <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-500 hover:text-slate-700" aria-label="Toggle password">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-2 text-sm text-red-600">{errors.password.message}</p>}
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                Remember me
              </label>
              <Link to="/" className="font-semibold text-sky-600 hover:text-sky-700">Forgot password?</Link>
            </div>

            {statusMessage && (
              <div className={`rounded-2xl border px-3 py-2 text-sm ${statusMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {statusMessage.text}
              </div>
            )}

            <button type="submit" disabled={isSubmitting} className="primary-button w-full">
              {isSubmitting ? 'Signing in...' : 'Login'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => navigate('/emergency')}
              className="secondary-button w-full"
            >
              Emergency
            </button>

            <div className="pt-2 text-center text-sm text-slate-600">
              Need an account? <Link to="/register" className="font-semibold text-sky-600 hover:text-sky-700">Create one</Link>
            </div>
          </form>
        </motion.section>
      </div>
    </main>
  );
}
