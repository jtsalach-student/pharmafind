import { AlertCircle, AlertTriangle, ArrowLeft, Boxes, Loader2, PackageSearch, ShieldCheck, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getInventory, updateInventoryItem } from '../lib/data';

interface InventoryItem {
  id: string;
  drugId: string;
  pharmacyId: string;
  quantity: number;
  isAvailable: boolean;
  isActive: boolean;
  price?: number;
  expiryDate?: string;
  batchNumber?: string;
  drug?: {
    id: string;
    genericName: string;
    brandName: string;
    drugType?: string;
    strength?: string;
  };
}

export function InventoryPage() {
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      setIsSaving(true);
      setError(null);
      await updateInventoryItem(editingItem.id, {
        quantity: editingItem.quantity,
        price: editingItem.price,
        isAvailable: editingItem.isAvailable,
        isActive: editingItem.isActive,
        batchNumber: editingItem.batchNumber,
        expiryDate: editingItem.expiryDate ? new Date(editingItem.expiryDate).toISOString() : null
      });
      await fetchInventory();
      setEditingItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save inventory item');
    } finally {
      setIsSaving(false);
    }
  };

  const lowStockItems = inventory.filter(item => item.quantity < 20).length;
  const totalActive = inventory.filter(item => item.isActive).length;
  const outOfStockItems = inventory.filter(item => item.quantity === 0).length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

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
                      <div className="flex-1">
                        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">{item.drug?.genericName || item.drugId}</div>
                        <div className="mt-1 text-base font-bold text-slate-900">{item.drug?.brandName || 'Unknown drug'}</div>
                        {item.drug?.drugType && (
                          <div className="mt-1 text-xs text-slate-600">
                            <span className="font-semibold">Type:</span> {item.drug.drugType}
                          </div>
                        )}
                        {item.drug?.strength && (
                          <div className="text-xs text-slate-600">
                            <span className="font-semibold">Strength:</span> {item.drug.strength}
                          </div>
                        )}
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

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl bg-white p-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Quantity</div>
                        <div className="mt-1 text-xl font-black text-slate-900">{item.quantity}</div>
                      </div>
                      {item.price && (
                        <div className="rounded-2xl bg-white p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Price</div>
                          <div className="mt-1 text-xl font-black text-emerald-700">GH₵ {Number(item.price).toFixed(2)}</div>
                        </div>
                      )}
                      {item.expiryDate && (
                        <div className="rounded-2xl bg-white p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Expiry</div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">{new Date(item.expiryDate).toLocaleDateString()}</div>
                        </div>
                      )}
                      {item.batchNumber && (
                        <div className="rounded-2xl bg-white p-3">
                          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Batch</div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">{item.batchNumber}</div>
                        </div>
                      )}
                      <div className="rounded-2xl bg-white p-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
                        <div className="mt-1 text-sm font-black text-slate-900">{item.isAvailable ? '✓ Available' : '✗ Unavailable'}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                      className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Edit Inventory
                    </button>
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

      {/* INVENTORY EDIT MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
          <form onSubmit={handleSaveItem} className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-900 text-lg">Edit Inventory Item</h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:text-slate-800"
              >
                ✕
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Quantity</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={editingItem.quantity}
                  onChange={e => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value, 10) || 0 })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Price (GH₵)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingItem.price || ''}
                  onChange={e => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Batch Number</label>
                <input
                  type="text"
                  value={editingItem.batchNumber || ''}
                  onChange={e => setEditingItem({ ...editingItem, batchNumber: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={editingItem.expiryDate ? editingItem.expiryDate.split('T')[0] : ''}
                  onChange={e => setEditingItem({ ...editingItem, expiryDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div className="flex items-center gap-2 mt-4">
                <input
                  type="checkbox"
                  id="isAvailable"
                  checked={editingItem.isAvailable || false}
                  onChange={e => setEditingItem({ ...editingItem, isAvailable: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                />
                <label htmlFor="isAvailable" className="text-sm font-medium text-slate-700">Available</label>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editingItem.isActive || false}
                  onChange={e => setEditingItem({ ...editingItem, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-slate-700">Active</label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-sky-600 px-6 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
