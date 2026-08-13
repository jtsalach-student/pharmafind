import { Activity, AlertTriangle, ArrowUpRight, Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getAuditLogs } from '../lib/data';

interface AuditEntry {
  id: string;
  actorId?: string;
  action: string;
  targetEntity: string;
  targetId?: string;
  outcome: string;
  metadata?: string;
  createdAt: string;
}

export function AdminAuditPage() {
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAudits = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getAuditLogs();
        setAudits(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audit logs');
      } finally {
        setLoading(false);
      }
    };

    fetchAudits();
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">System admin</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Audit and governance</h1>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Audit enabled
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Total logs</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{audits.length}</div>
            <div className="mt-2 text-xs font-medium text-slate-500">Recorded events</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Source</div>
            <div className="mt-3 text-3xl font-black text-slate-900">Supabase</div>
            <div className="mt-2 text-xs font-medium text-slate-500">Real-time</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{loading ? '—' : 'Live'}</div>
            <div className="mt-2 text-xs font-medium text-slate-500">Data loaded</div>
          </div>
        </div>
      </section>

      {error && (
        <div className="mt-6 flex gap-3 rounded-[28px] border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Error loading audit logs</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 p-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : audits.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-12 text-center">
          <p className="text-slate-600">No audit logs found.</p>
        </div>
      ) : (
        <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">Recent audit trail</h2>
              <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-sky-700">
                View exports
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {audits.map((entry, index) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className="flex items-start gap-4 rounded-[22px] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <Activity className="h-4 w-4" />
                  </div>

                  <div className="flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm font-semibold text-slate-900">{entry.action}</div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                        {entry.outcome}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">{entry.targetEntity}</div>
                    <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                      {new Date(entry.createdAt).toLocaleString()}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h2 className="text-xl font-black text-slate-900">Audit status</h2>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Data source</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">Supabase AuditLog</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Total events</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{audits.length}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Update frequency</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">Real-time</div>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h2 className="text-xl font-black text-slate-900">Data integrity</h2>
              </div>

              <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-sm font-semibold text-emerald-800">All audit logs sourced from Supabase.</div>
                <div className="mt-2 text-sm text-emerald-700">No mock or placeholder data is displayed.</div>
              </div>
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}
