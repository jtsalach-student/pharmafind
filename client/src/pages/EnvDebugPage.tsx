export function EnvDebugPage() {
  const paystackKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ?? '';
  const envLoaded = typeof paystackKey === 'string' && paystackKey.trim().length > 0;
  const validKey = /^pk_(test|live)_[A-Za-z0-9]+$/.test(paystackKey.trim());
  const keyPreview = paystackKey.trim() ? paystackKey.trim().slice(0, 10) : 'N/A';

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Diagnostic</div>
        <h1 className="mt-3 text-3xl font-black text-slate-900">Paystack environment check</h1>

        <div className="mt-6 space-y-3 text-sm text-slate-700">
          <div className="flex justify-between rounded-2xl bg-slate-50 p-3">
            <span>Environment Loaded</span>
            <span className={envLoaded ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}>
              {envLoaded ? 'YES' : 'NO'}
            </span>
          </div>
          <div className="flex justify-between rounded-2xl bg-slate-50 p-3">
            <span>Paystack Key Found</span>
            <span className={validKey ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}>
              {validKey ? 'YES' : 'NO'}
            </span>
          </div>
          <div className="flex justify-between rounded-2xl bg-slate-50 p-3">
            <span>First 10 chars</span>
            <span className="font-mono font-semibold text-slate-900">{keyPreview}</span>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Raw env snapshot</div>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-slate-700">
            {JSON.stringify(import.meta.env, null, 2)}
          </pre>
        </div>
      </div>
    </main>
  );
}
