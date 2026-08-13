import PaystackPop from '@paystack/inline-js';
import { AlertCircle, ArrowLeft, CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { getUser } from '../lib/auth';
import { getSupabaseClient } from '../lib/supabase';

type PaymentRouteState = {
  prescriptionId?: string;
  drugId?: string;
  drugName?: string;
  pharmacyId?: string;
  pharmacyName?: string;
  quantity?: number;
  unitPrice?: number;
  deliveryFee?: number;
  requiresRx?: boolean;
};

export function PaymentPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const routeState = (state as PaymentRouteState | null) ?? {};

  const [status, setStatus] = useState('Processing payment details');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const quantity = routeState.quantity ?? 1;
  const unitPrice = routeState.unitPrice ?? 0;
  const deliveryFee = routeState.deliveryFee ?? 2.5; // Default delivery fee
  const drugCost = quantity * unitPrice;
  const totalCost = drugCost + deliveryFee;

  useEffect(() => {
    // For Rx drugs, we must have a prescriptionId
    // For non-Rx drugs, we just need drugId
    const hasRequiredInfo = (routeState.requiresRx && routeState.prescriptionId) || 
                            (!routeState.requiresRx && routeState.drugId);
    
    if (!hasRequiredInfo) {
      setErrorMessage('Missing order information. Please start over.');
      navigate('/dashboard', { replace: true });
    }
  }, [routeState.prescriptionId, routeState.drugId, routeState.requiresRx, navigate]);

  const handlePayment = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setStatus('Connecting to secure payment provider...');

      const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
      if (!publicKey) {
        throw new Error('Paystack public key is not configured. Please add VITE_PAYSTACK_PUBLIC_KEY to the client environment.');
      }

      const user = getUser();
      const email = user?.email || 'customer@example.com';
      const reference = `pharmafind_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      await api.post('/payments/initialize', {
        amountGhs: Number(totalCost.toFixed(2)),
        email,
        reference
      });

      const paystack = new PaystackPop();
      paystack.newTransaction({
        key: publicKey,
        email,
        amount: Math.round(totalCost * 100),
        currency: 'GHS',
        ref: reference,
        metadata: {
          custom_fields: [
            {
              display_name: 'Order',
              variable_name: 'order',
              value: routeState.drugName || 'PharmaFind order'
            }
          ]
        },
        onClose: () => {
          setStatus('Payment cancelled.');
          setIsSubmitting(false);
        },
        callback: async (response: { reference?: string; status?: string; trxref?: string }) => {
          try {
            const verificationRef = response.reference || response.trxref || reference;
            const verification = await api.get(`/payments/${verificationRef}/verify`);
            if (!verification || !verification.data) {
              throw new Error('Unable to verify payment.');
            }

            const client = getSupabaseClient();
            const { data: authData, error: authError } = await client.auth.getUser();
            if (authError || !authData.user) {
              throw new Error('You need to be signed in to make a payment.');
            }

            let prescriptionId = routeState.prescriptionId;

            if (!routeState.requiresRx && !prescriptionId) {
              const { data: prescription, error: prescError } = await client
                .from('Prescription')
                .insert({
                  userId: authData.user.id,
                  pharmacyId: routeState.pharmacyId || undefined,
                  drugId: routeState.drugId || undefined,
                  status: 'APPROVED',
                  filePath: 'non-rx-auto-approved',
                  originalFileName: `${routeState.drugName}-order.txt`,
                  mimeType: 'text/plain',
                  fileSize: 0,
                  quantity: quantity,
                  ocrText: 'Non-prescription drug - auto-approved',
                  ocrConfidence: 100
                })
                .select()
                .single();

              if (prescError) {
                throw prescError;
              }

              prescriptionId = prescription.id;
              console.info('[Payment] Created non-Rx prescription', { prescriptionId });
            }

            if (!prescriptionId) {
              throw new Error('Unable to process your order. Please try again.');
            }

            const { data: delivery, error: deliveryError } = await client
              .from('DeliveryRequest')
              .insert({
                userId: authData.user.id,
                prescriptionId: prescriptionId,
                status: 'REQUESTED'
              })
              .select()
              .single();

            if (deliveryError) {
              throw deliveryError;
            }

            console.info('[Payment] Payment successful', {
              deliveryId: delivery.id,
              prescriptionId,
              totalCost,
              requiresRx: routeState.requiresRx,
              verificationRef
            });

            setStatus('Payment successful! Delivery is being arranged.');
            navigate('/deliveries/track', {
              replace: true,
              state: { notice: 'Payment successful! Your delivery has been requested.' }
            });
          } catch (callbackError) {
            const message = callbackError instanceof Error ? callbackError.message : 'Unable to complete your payment.';
            setErrorMessage(message);
            setStatus('Payment verification failed');
          } finally {
            setIsSubmitting(false);
          }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process payment.';
      setErrorMessage(message);
      setStatus('Payment failed');
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-slate-200 bg-white/80 p-6 shadow-[0_25px_70px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-8">
        <div className="mb-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-4 flex items-center gap-2 text-sm font-semibold text-sky-600 hover:text-sky-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div>
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Order summary</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">Confirm payment</h1>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 flex gap-3 rounded-[24px] border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-sm text-red-700">{errorMessage}</p>
            </div>
          </div>
        )}

        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6 space-y-5">
          {/* Drug Information */}
          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Medicine</div>
            <div className="mt-3 text-lg font-black text-slate-900">{routeState.drugName ?? 'Selected medicine'}</div>
            <div className="mt-2 text-sm text-slate-600">Pharmacy: {routeState.pharmacyName ?? 'Selected pharmacy'}</div>
          </div>

          {/* Cost Breakdown */}
          <div className="space-y-3">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Cost breakdown</div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Medicine ({quantity}x)</span>
                <span className="font-semibold text-slate-900">GH₵ {drugCost.toFixed(2)}</span>
              </div>
              {unitPrice > 0 && (
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>Unit price</span>
                  <span>GH₵ {unitPrice.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Delivery fee</span>
                <span className="font-semibold text-slate-900">GH₵ {deliveryFee.toFixed(2)}</span>
              </div>
              <div className="mt-2 text-xs text-slate-500">Express delivery within 30-45 minutes</div>
            </div>

            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex justify-between">
                <span className="font-semibold text-emerald-900">Total amount</span>
                <span className="text-xl font-black text-emerald-700">GH₵ {totalCost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">Paystack</div>
                <div className="text-xs text-slate-500">Secure payment gateway</div>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 text-xs text-slate-600">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600 mt-0.5" />
              <div>
                By completing this payment, you authorize PharmaFind to process your order and arrange delivery to your specified address.
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={isSubmitting}
            className="secondary-button flex-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePayment}
            disabled={isSubmitting || errorMessage !== null}
            className="primary-button flex-1"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Pay GH₵ {totalCost.toFixed(2)}
              </>
            )}
          </button>
        </div>

        <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          <div className="font-semibold mb-2">🔒 Secure Payment</div>
          Your payment information is encrypted and processed securely through Paystack.
        </div>

        <div className="mt-4 text-center text-xs text-slate-500">
          Status: <span className="font-semibold text-slate-600">{status}</span>
        </div>
      </div>
    </main>
  );
}
