import { HeartPulse } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clearSession, getUser } from '../lib/auth';

export function Nav() {
  const navigate = useNavigate();
  const user = getUser();

  const handleSignOut = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-lg shadow-sky-200">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight text-slate-900">PharmaFind</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Healthcare access</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <>
              <div className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 sm:inline-flex">
                {user.role}
              </div>
              <button type="button" onClick={handleSignOut} className="secondary-button px-4 py-2 text-sm">
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
