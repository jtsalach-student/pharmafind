import { HeartPulse, ShoppingCart, ShieldCheck, Stethoscope, Truck, Search, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getRoleDashboard, getUser } from '../lib/auth';
import { useCart } from '../contexts/CartContext';
import { CartSidebar } from './CartSidebar';
import { NotificationBell } from './NotificationBell';

export function Nav() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const { cart } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);

  const handleSignOut = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  const handleLogoClick = () => {
    if (user?.role) {
      navigate(getRoleDashboard(user.role));
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6 lg:px-8">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <div
              onClick={handleLogoClick}
              className="flex items-center gap-3 cursor-pointer select-none group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-md shadow-sky-200 group-hover:scale-105 transition-transform">
                <HeartPulse className="h-5 w-5" />
              </div>
              <div>
                <div className="text-lg font-black tracking-tight text-slate-900 leading-tight">PharmaFind</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  {user?.role === 'SYSTEM_ADMIN' ? 'Operations Admin' : user?.role === 'PHARMACIST' ? 'Pharmacist Portal' : user?.role === 'DRIVER' ? 'Logistics Hub' : 'Healthcare Network'}
                </div>
              </div>
            </div>

            {/* Navigation links based on role */}
            {user && (
              <nav className="hidden md:flex items-center gap-1.5 pl-2 border-l border-slate-200">
                {user.role === 'SYSTEM_ADMIN' && (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate('/admin')}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                        location.pathname === '/admin' || location.pathname === '/system'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Operations Center
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate('/pharmacist')}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                        location.pathname === '/pharmacist'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Stethoscope className="h-3.5 w-3.5" />
                      Pharmacist Review
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate('/driver')}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                        location.pathname === '/driver' || location.pathname === '/driver-dashboard'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Driver Hub
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                        location.pathname === '/dashboard'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Search className="h-3.5 w-3.5" />
                      User Search
                    </button>
                  </>
                )}

                {user.role === 'PHARMACIST' && (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate('/pharmacist')}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                        location.pathname === '/pharmacist'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Stethoscope className="h-3.5 w-3.5" />
                      Orders & Prescription Review
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                        location.pathname === '/dashboard'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Search className="h-3.5 w-3.5" />
                      Medication Catalog
                    </button>
                  </>
                )}

                {user.role === 'DRIVER' && (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate('/driver')}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                        location.pathname === '/driver' || location.pathname === '/driver-dashboard'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Deliveries Queue
                    </button>
                  </>
                )}

                {user.role === 'USER' && (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                        location.pathname === '/dashboard'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <LayoutDashboard className="h-3.5 w-3.5" />
                      Find Medicines
                    </button>
                  </>
                )}
              </nav>
            )}
          </div>

          {/* Right Action Tools */}
          <div className="flex items-center gap-3">
            {user && (
              <>
                <NotificationBell />

                <button
                  type="button"
                  onClick={() => setIsCartOpen(true)}
                  className="relative rounded-xl p-2 text-slate-700 hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  aria-label="Shopping cart"
                >
                  <ShoppingCart className="h-5 w-5" />
                  {cart.totalItems > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[11px] font-black text-white shadow-md">
                      {cart.totalItems}
                    </span>
                  )}
                </button>

                <div className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-700 sm:inline-flex">
                  {user.role}
                </div>

                <button type="button" onClick={handleSignOut} className="secondary-button px-3.5 py-1.5 text-xs font-semibold">
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
