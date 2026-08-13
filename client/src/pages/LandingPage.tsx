import { motion } from 'framer-motion';
import { ArrowRight, Clock3, HeartPulse, MapPinned, ShieldCheck, Stethoscope } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const featureList = [
  { icon: MapPinned, title: 'Find nearby care', text: 'Locate pharmacies with live medicine availability and real-time coverage.' },
  { icon: ShieldCheck, title: 'Prescription-safe', text: 'Smart checks for Rx-required medicines before checkout.' },
  { icon: Clock3, title: 'Fast delivery', text: 'Track dispatch ETA and driver progress from order to doorstep.' }
];

const stats = [
  { value: '3.4k', label: 'Orders delivered' },
  { value: '15 min', label: 'Average ETA' },
  { value: '24/7', label: 'Emergency support' }
];

type AuthTab = 'login' | 'signup';

export function LandingPage() {
  const [tab, setTab] = useState<AuthTab>('login');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [signupForm, setSignupForm] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const navigate = useNavigate();

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate('/dashboard');
  };

  const handleSignup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate('/dashboard');
  };

  return (
    <main className="relative min-h-[calc(100vh-73px)] overflow-hidden bg-slate-50">
      <div className="grid-pattern absolute inset-0 opacity-50" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-12">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="space-y-8"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            <HeartPulse className="h-3.5 w-3.5" />
            Trusted medical access
          </div>

          <div className="space-y-5">
            <h1 className="max-w-xl text-4xl font-black tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Medicine delivery, <span className="text-sky-600">care, and emergency help</span> in one place.
            </h1>
            <p className="max-w-xl text-lg text-slate-600">
              PharmaFind helps patients, pharmacies, and delivery teams move faster with precise medicine discovery, prescription workflows, and healthcare logistics built for everyday life.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={() => setTab('login')} className="primary-button w-full sm:w-auto">
              Get started <ArrowRight className="ml-2 h-4 w-4" />
            </button>
            <Link to="/emergency" className="secondary-button w-full sm:w-auto">
              Emergency mode
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <motion.div whileHover={{ y: -2 }} key={stat.label} className="glass-card rounded-3xl p-4">
                <div className="text-2xl font-black text-slate-900">{stat.value}</div>
                <div className="mt-1 text-sm text-slate-600">{stat.label}</div>
              </motion.div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {featureList.map(({ icon: Icon, title, text }) => (
              <motion.article whileHover={{ y: -4 }} key={title} className="glass-card rounded-3xl p-5">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </motion.article>
            ))}
          </div>
        </motion.section>

        <motion.aside initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, delay: 0.05 }} className="relative">
          <div className="glass-card rounded-[32px] p-5 shadow-[0_30px_80px_rgba(14,165,233,0.12)]">
            <div className="rounded-[28px] bg-gradient-to-br from-sky-500 via-cyan-400 to-emerald-400 p-5 text-white">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-sky-100">Care dashboard</div>
                  <div className="mt-2 text-2xl font-black">Live health access</div>
                </div>
                <div className="rounded-full bg-white/20 p-2">
                  <Stethoscope className="h-5 w-5" />
                </div>
              </div>

              <div className="space-y-4 rounded-[24px] bg-white/10 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-sky-100">Medicine availability</span>
                  <span className="font-semibold">96%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full w-[96%] rounded-full bg-white" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-sky-100">ETA</div>
                    <div className="mt-2 text-xl font-black">15 min</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-sky-100">Coverage</div>
                    <div className="mt-2 text-xl font-black">4.8 km</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[26px] border border-slate-200 bg-white p-4">
              <div className="mb-4 flex rounded-full bg-slate-100 p-1">
                {(['login', 'signup'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTab(mode)}
                    className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
                      tab === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {mode === 'login' ? 'Login' : 'Sign Up'}
                  </button>
                ))}
              </div>

              {tab === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
                    <input id="login-email" type="email" className="input-shell" value={loginForm.email} onChange={(e) => setLoginForm((v) => ({ ...v, email: e.target.value }))} />
                  </div>
                  <div>
                    <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
                    <input id="login-password" type="password" className="input-shell" value={loginForm.password} onChange={(e) => setLoginForm((v) => ({ ...v, password: e.target.value }))} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Need access fast?</span>
                    <button type="button" onClick={() => navigate('/dashboard')} className="font-semibold text-sky-600">Guest mode</button>
                  </div>
                  <button type="submit" className="primary-button w-full">
                    Login <ArrowRight className="ml-2 h-4 w-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignup} className="space-y-4">
                  <div>
                    <label htmlFor="signup-name" className="mb-2 block text-sm font-semibold text-slate-700">Full Name</label>
                    <input id="signup-name" className="input-shell" value={signupForm.fullName} onChange={(e) => setSignupForm((v) => ({ ...v, fullName: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="signup-email" className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
                      <input id="signup-email" type="email" className="input-shell" value={signupForm.email} onChange={(e) => setSignupForm((v) => ({ ...v, email: e.target.value }))} />
                    </div>
                    <div>
                      <label htmlFor="signup-phone" className="mb-2 block text-sm font-semibold text-slate-700">Phone</label>
                      <input id="signup-phone" className="input-shell" value={signupForm.phone} onChange={(e) => setSignupForm((v) => ({ ...v, phone: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="signup-password" className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
                    <input id="signup-password" type="password" className="input-shell" value={signupForm.password} onChange={(e) => setSignupForm((v) => ({ ...v, password: e.target.value }))} />
                  </div>
                  <div>
                    <label htmlFor="signup-confirm" className="mb-2 block text-sm font-semibold text-slate-700">Confirm Password</label>
                    <input id="signup-confirm" type="password" className="input-shell" value={signupForm.confirmPassword} onChange={(e) => setSignupForm((v) => ({ ...v, confirmPassword: e.target.value }))} />
                  </div>
                  <button type="submit" className="primary-button w-full">
                    Create Account <ArrowRight className="ml-2 h-4 w-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </motion.aside>
      </div>
    </main>
  );
}

