import { ArrowRight, Mail, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';

export function CheckEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email] = useState<string>((location.state as { email?: string } | null)?.email ?? sessionStorage.getItem('pharmafind_pending_signup_email') ?? '');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (email) {
      sessionStorage.setItem('pharmafind_pending_signup_email', email);
    }
  }, [email]);

  const handleResend = async () => {
    if (!email) {
      setStatus({ type: 'error', text: 'No email address is available to resend the confirmation message.' });
      return;
    }

    try {
      setResending(true);
      setStatus(null);
      const client = getSupabaseClient();
      const { error } = await client.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/login`
        }
      });

      if (error) {
        throw error;
      }

      setStatus({ type: 'success', text: 'A new verification email has been sent.' });
    } catch (error: any) {
      setStatus({ type: 'error', text: error?.message || 'Unable to resend the verification email right now.' });
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-3xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full rounded-[32px] border border-slate-200 bg-white/80 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
            <Mail className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-3xl font-black text-slate-900">Confirm Your Email</h1>
          <p className="mt-3 max-w-xl text-base text-slate-600">
            We have sent a verification link to your email address. Please verify your email before signing in.
          </p>

          {email && (
            <div className="mt-4 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
              {email}
            </div>
          )}

          <div className="mt-6 w-full rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-left text-sm text-slate-600">
            <div className="mb-3 font-bold uppercase tracking-[0.18em] text-slate-500">Verification instructions</div>
            <ul className="space-y-2">
              <li>1. Check your inbox for the confirmation email.</li>
              <li>2. Click the verification link to confirm your account.</li>
              <li>3. Return here and sign in once your email is confirmed.</li>
            </ul>
          </div>

          {status && (
            <div className={`mt-6 w-full rounded-[20px] border px-4 py-3 text-sm ${status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {status.text}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={handleResend} disabled={resending} className="secondary-button">
              <RefreshCw className={`mr-2 h-4 w-4 ${resending ? 'animate-spin' : ''}`} />
              {resending ? 'Sending...' : 'Resend Email'}
            </button>
            <button type="button" onClick={() => navigate('/login', { replace: true })} className="primary-button">
              Go to Login <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </div>

          <div className="mt-6 text-sm text-slate-600">
            Need help? <Link to="/login" className="font-semibold text-sky-600">Return to sign in</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
