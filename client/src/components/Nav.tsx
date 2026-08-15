import { HeartPulse, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession, getUser } from '../lib/auth';
import { useCart } from '../contexts/CartContext';
import { CartSidebar } from './CartSidebar';
import { NotificationBell } from './NotificationBell';

export function Nav() {
  const navigate = useNavigate();
  const user = getUser();
  const { cart } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);

  const handleSignOut = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-3 cursor-pointer"
          >
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
                <NotificationBell />

                <button
                  type="button"
                  onClick={() => setIsCartOpen(true)}
                  className="relative rounded-xl p-2.5 text-slate-700 hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  aria-label="Shopping cart"
                >
                  <ShoppingCart className="h-5 w-5" />
                  {cart.totalItems > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[11px] font-black text-white shadow-md">
                      {cart.totalItems}
                    </span>
                  )}
                </button>
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
      <CartSidebar isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}
