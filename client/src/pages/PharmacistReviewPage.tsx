import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, Stethoscope, ThumbsDown, MessageSquare, ThumbsUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getPrescriptions, type PrescriptionRecord } from '../lib/data';
import { api } from '../lib/api';

type ReviewState = {
  prescriptionId: string | null;
  decision: 'APPROVED' | 'REJECTED' | 'CLARIFICATION_REQUESTED' | null;
  reason: string;
  isSubmitting: boolean;
}

export function PharmacistReviewPage() {
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>({
    prescriptionId: null,
    decision: null,
    reason: '',
    isSubmitting: false
  });
  const [reviewMessage, setReviewMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const fetchPrescriptions = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getPrescriptions();
        // Filter by PENDING_REVIEW status
        const pending = data.filter(p => p.status === 'PENDING_REVIEW');
        setPrescriptions(pending);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load prescriptions');
      } finally {
        setLoading(false);
      }
    };

    fetchPrescriptions();
  }, []);

  const handleReviewClick = (prescriptionId: string) => {
    setReviewState({
      prescriptionId,
      decision: null,
      reason: '',
      isSubmitting: false
    });
    setReviewMessage(null);
  };

  const handleCancelReview = () => {
    setReviewState({
      prescriptionId: null,
      decision: null,
      reason: '',
      isSubmitting: false
    });
    setReviewMessage(null);
  };

  const handleSubmitReview = async () => {
    if (!reviewState.prescriptionId || !reviewState.decision) {
      setReviewMessage({ type: 'error', text: 'Please select an action before submitting.' });
      return;
    }

    if (!reviewState.reason.trim()) {
      setReviewMessage({ type: 'error', text: 'Please provide a reason for your decision.' });
      return;
    }

    try {
      setReviewState(prev => ({ ...prev, isSubmitting: true }));
      setReviewMessage(null);

      await api.patch(`/prescriptions/${reviewState.prescriptionId}/review`, {
        decision: reviewState.decision,
        reason: reviewState.reason.trim()
      });

      // Remove reviewed prescription from list
      setPrescriptions(prev => prev.filter(p => p.id !== reviewState.prescriptionId));
      
      setReviewMessage({
        type: 'success',
        text: `Prescription ${reviewState.decision.toLowerCase().replace('_', ' ')} successfully.`
      });

      // Reset review state after success
      setTimeout(() => {
        setReviewState({
          prescriptionId: null,
          decision: null,
          reason: '',
          isSubmitting: false
        });
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to submit review.';
      setReviewMessage({ type: 'error', text: message });
    } finally {
      setReviewState(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const pendingCount = prescriptions.length;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Pharmacist review</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Prescription queue</h1>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Quality assured
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Pending review</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{pendingCount}</div>
            <div className="mt-2 text-xs font-medium text-slate-500">In queue</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
            <div className="mt-3 text-3xl font-black text-slate-900">{loading ? '—' : 'Ready'}</div>
            <div className="mt-2 text-xs font-medium text-slate-500">Data source active</div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Source</div>
            <div className="mt-3 text-3xl font-black text-slate-900">Supabase</div>
            <div className="mt-2 text-xs font-medium text-slate-500">Real-time data</div>
          </div>
        </div>
      </section>

      {error && (
        <div className="mt-6 flex gap-3 rounded-[28px] border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Error loading prescriptions</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 p-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-12 text-center">
          <p className="text-slate-600">No pending prescriptions to review.</p>
        </div>
      ) : (
        <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">Review queue</h2>
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">
                <Stethoscope className="h-3.5 w-3.5" />
                Active
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {prescriptions.map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">{item.id}</div>
                      <div className="mt-2 text-lg font-black text-slate-900">{item.originalFileName || 'Prescription'}</div>
                      <div className="mt-1 text-sm text-slate-600">Awaiting review</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
                        PENDING
                      </span>
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-700">
                        New
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white p-3">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Uploaded</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{item.status}</div>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Action</div>
                      <button
                        type="button"
                        onClick={() => handleReviewClick(item.id)}
                        className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-800"
                      >
                        Review now
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
              <h2 className="text-xl font-black text-slate-900">Queue status</h2>

              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Total pending</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{prescriptions.length} prescription(s)</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Data source</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">Supabase (live)</div>
                </div>
              </div>

              <button type="button" className="mt-4 w-full rounded-full bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700">
                <CheckCircle2 className="mr-2 inline h-4 w-4" />
                Refresh queue
              </button>
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
              <h2 className="text-xl font-black text-slate-900">Operational rules</h2>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <div>• All prescriptions loaded from database.</div>
                <div>• No mock or sample data.</div>
                <div>• Real-time updates enabled.</div>
              </div>
            </div>
          </aside>
        </section>
      )}

      {/* Review Modal */}
      {reviewState.prescriptionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.15)] sm:p-8"
          >
            <h2 className="text-2xl font-black text-slate-900">Review prescription</h2>
            <p className="mt-2 text-sm text-slate-600">Select an action and provide your reason.</p>

            {reviewMessage && (
              <div
                className={`mt-4 rounded-[20px] border px-4 py-3 text-sm ${
                  reviewMessage.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {reviewMessage.text}
              </div>
            )}

            {/* Decision Buttons */}
            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => setReviewState(prev => ({ ...prev, decision: 'APPROVED' }))}
                disabled={reviewState.isSubmitting}
                className={`w-full rounded-[24px] border-2 p-4 text-left transition ${
                  reviewState.decision === 'APPROVED'
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50 hover:border-emerald-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    reviewState.decision === 'APPROVED' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    <ThumbsUp className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Approve</div>
                    <div className="text-xs text-slate-600">Patient can proceed to payment</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReviewState(prev => ({ ...prev, decision: 'REJECTED' }))}
                disabled={reviewState.isSubmitting}
                className={`w-full rounded-[24px] border-2 p-4 text-left transition ${
                  reviewState.decision === 'REJECTED'
                    ? 'border-red-500 bg-red-50'
                    : 'border-slate-200 bg-slate-50 hover:border-red-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    reviewState.decision === 'REJECTED' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-600'
                  }`}>
                    <ThumbsDown className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Reject</div>
                    <div className="text-xs text-slate-600">Order will be cancelled</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReviewState(prev => ({ ...prev, decision: 'CLARIFICATION_REQUESTED' }))}
                disabled={reviewState.isSubmitting}
                className={`w-full rounded-[24px] border-2 p-4 text-left transition ${
                  reviewState.decision === 'CLARIFICATION_REQUESTED'
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-slate-200 bg-slate-50 hover:border-amber-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    reviewState.decision === 'CLARIFICATION_REQUESTED' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-600'
                  }`}>
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Request clarification</div>
                    <div className="text-xs text-slate-600">Patient will be notified</div>
                  </div>
                </div>
              </button>
            </div>

            {/* Reason Input */}
            <div className="mt-6">
              <label htmlFor="reason" className="block text-sm font-semibold text-slate-700">
                Reason for decision
              </label>
              <textarea
                id="reason"
                value={reviewState.reason}
                onChange={(e) => setReviewState(prev => ({ ...prev, reason: e.target.value }))}
                disabled={reviewState.isSubmitting}
                placeholder="Explain your decision..."
                className="input-shell mt-2 min-h-[100px]"
              />
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleCancelReview}
                disabled={reviewState.isSubmitting}
                className="secondary-button flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={reviewState.isSubmitting || !reviewState.decision}
                className="primary-button flex-1"
              >
                {reviewState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit review'
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}

