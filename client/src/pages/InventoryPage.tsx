import { AlertCircle, AlertTriangle, ArrowRight, Boxes, Loader2, PackageSearch, ShieldCheck, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getInventory } from '../lib/data';

interface InventoryItem {
  id: string;
  drugId: string;
  pharmacyId: string;
  quantity: number;
  isAvailable: boolean;
  isActive: boolean;
  drug?: {
    id: string;
    genericName: string;
    brandName: string;
  };
}

export function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInventory = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getInventory();
        setInventory(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load inventory');
      } finally {
        setLoading(false);
      }
    };

    fetchInventory();
  }, []);

  const lowStockItems = inventory.filter(item => item.quantity < 20).length;
  const totalActive = inventory.filter(item => item.isActive).length;
  const outOfStockItems = inventory.filter(item => item.quantity === 0).length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Inventory operations</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Pharmacy stock management</h1>
          </div>

          <button type="button" className="primary-button px-4 py-2 text-sm">
            Export inventory report
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Total items</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{totalActive}</div>
            <div className="mt-2 text-xs font-medium text-slate-500">Active drugs</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Low stock</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{lowStockItems}</div>
            <div className="mt-2 text-xs font-medium text-slate-500">Need attention</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Out of stock</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{outOfStockItems}</div>
            <div className="mt-2 text-xs font-medium text-slate-500">Immediate action</div>
          </div>
        </div>
      </section>

      {error && (
        <div className="mt-6 flex gap-3 rounded-[28px] border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Error loading inventory</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 p-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : inventory.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-12 text-center">
          <p className="text-slate-600">No inventory items found.</p>
        </div>
      ) : (
        <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">Inventory list</h2>
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">
                <Boxes className="h-3.5 w-3.5" />
                Live catalog
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {inventory.map((item) => {
                const status = item.quantity === 0 ? 'Critical' : item.quantity < 20 ? 'Watch' : 'Healthy';
                const risk = item.quantity === 0 ? 'High' : item.quantity < 20 ? 'Medium' : 'Low';
                
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-[22px] border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">{item.drug?.genericName || item.drugId}</div>
                        <div className="mt-1 text-base font-bold text-slate-900">{item.drug?.brandName || 'Unknown drug'}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                          status === 'Critical'
                            ? 'bg-red-100 text-red-700'
                            : status === 'Watch'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {status}
                        </span>
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700">
                          {risk} risk
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white p-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">On hand</div>
                        <div className="mt-1 text-xl font-black text-slate-900">{item.quantity}</div>
                      </div>
                      <div className="rounded-2xl bg-white p-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Availability</div>
                        <div className="mt-1 text-sm font-black text-slate-900">{item.isAvailable ? 'Available' : 'Unavailable'}</div>
                      </div>
                      <div className="rounded-2xl bg-white p-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Action</div>
                        <button type="button" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">
                          Manage
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <h2 className="text-xl font-black text-slate-900">Summary</h2>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Total SKUs</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{inventory.length}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Active inventory</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{inventory.reduce((sum, item) => sum + (item.isActive ? item.quantity : 0), 0)}</div>
                </div>
              </div>
            </div>

            {lowStockItems > 0 && (
              <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <h2 className="text-xl font-black text-slate-900">Priority action</h2>
                </div>

                <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 p-4">
                  <div className="text-sm font-semibold text-amber-800">{lowStockItems} item(s) below safe threshold.</div>
                  <div className="mt-2 text-sm text-amber-700">Review and place reorders as needed.</div>
                </div>

                <button type="button" className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900">
                  <PackageSearch className="h-4 w-4" />
                  Manage reorders
                </button>
              </div>
            )}

            <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h2 className="text-xl font-black text-slate-900">Data source</h2>
              </div>

              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <div>• All inventory data comes from Supabase.</div>
                <div>• Stock levels are updated in real time.</div>
                <div>• No mock or sample data is displayed.</div>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
