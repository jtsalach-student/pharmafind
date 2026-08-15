import PaystackPop from '@paystack/inline-js';
import { AlertCircle, ArrowLeft, CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { getUser } from '../lib/auth';
import { calculateDeliveryFee } from '../lib/geolocation';
import { getSupabaseClient } from '../lib/supabase';

const MOCK_PAYMENT_MODE = true;
const isMockPaymentMode = MOCK_PAYMENT_MODE || import.meta.env.VITE_MOCK_PAYMENTS === 'true';

type PaymentRouteState = {
  prescriptionId?: string;
  drugId?: string;
  drugName?: string;
  pharmacyId?: string;
  pharmacyName?: string;
  quantity?: number;
  unitPrice?: number;
  distanceKm?: number;
  requiresRx?: boolean;
};

export function PaymentPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const routeState = (state as PaymentRouteState | null) ?? {};

  const [status, setStatus] = useState('Processing payment details');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMockModalOpen, setIsMockModalOpen] = useState(false);

  const quantity = routeState.quantity ?? 1;
  const unitPrice = routeState.unitPrice ?? 0;
  const distanceKm = routeState.distanceKm ?? 0;
  const deliveryFee = calculateDeliveryFee(distanceKm);
  const subtotal = Number((quantity * unitPrice).toFixed(2));
  const totalCost = Number((subtotal + deliveryFee).toFixed(2));

  if (quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }

  useEffect(() => {
    const hasRequiredInfo = (routeState.requiresRx && routeState.prescriptionId) ||
      (!routeState.requiresRx && routeState.drugId);

    if (!hasRequiredInfo) {
      setErrorMessage('Missing order information. Please start over.');
      navigate('/dashboard', { replace: true });
    }
  }, [routeState.prescriptionId, routeState.drugId, routeState.requiresRx, navigate]);

  const simulateMockPayment = async (result: 'success' | 'failed') => {
    try {
      setIsMockModalOpen(false);
      setIsSubmitting(true);
      setErrorMessage(null);
      setStatus(result === 'success' ? 'Simulating successful payment...' : 'Simulating failed payment...');

      console.log('MOCK PAYMENT ENABLED');
      console.log('Skipping Paystack');

      const user = getUser();
      if (!user?.id) {
        throw new Error('User session not found. Please log in again.');
      }

      const email = user.email || 'customer@example.com';
      const userId = user.id;
      const reference = `MOCK-${Date.now()}`;

      if (result === 'failed') {
        console.log('Payment failed. Order cancelled.', { reference, amountGhs: Number(totalCost.toFixed(2)), email });
        setStatus('Payment failed. Order cancelled.');
        setErrorMessage('Payment failed. Order cancelled.');
        setTimeout(() => navigate('/dashboard', { replace: true }), 1200);
        return;
      }

      console.log('Payment marked as PAID', { reference, amountGhs: Number(totalCost.toFixed(2)), email });

      console.log('Mock payment started', { userId });

      const client = getSupabaseClient();

      let prescriptionId = routeState.prescriptionId;

      if (!routeState.requiresRx && !prescriptionId) {
        console.log('Creating prescription for mock payment');
        const { data: prescription, error: prescError } = await client
          .from('Prescription')
          .insert({
            userId: userId,
            pharmacyId: routeState.pharmacyId || undefined,
            drugId: routeState.drugId || undefined,
            status: 'APPROVED',
            filePath: 'mock-payment-auto-approved',
            originalFileName: `${routeState.drugName || 'order'}-mock.txt`,
            mimeType: 'text/plain',
            fileSize: 0,
            quantity: quantity,
            ocrText: 'Mock payment approved',
            ocrConfidence: 100
          })
          .select()
          .single();

        if (prescError) {
          throw new Error(`Prescription creation failed: ${prescError.message}`);
        }

        prescriptionId = prescription.id;
      }

      if (!prescriptionId) {
        throw new Error('Unable to process your order. Please try again.');
      }

      console.log('Payment record created', { reference, totalCost, prescriptionId });

      const { data: delivery, error: deliveryError } = await client
        .from('DeliveryRequest')
        .insert({
          userId: userId,
          prescriptionId: prescriptionId,
          status: 'REQUESTED'
        })
        .select()
        .single();

      if (deliveryError) {
        throw new Error(`Delivery creation failed: ${deliveryError.message}`);
      }

      if (!delivery) {
        throw new Error('Delivery creation returned no record.');
      }

      console.log('Delivery record created', { deliveryId: delivery.id, status: delivery.status });
      const orderNumber = `ORD-${delivery.id.slice(0, 8).toUpperCase()}`;
      
      // Dispatch initial "Order Being Prepared" notification to user
      try {
        await client.from('Notification').insert([{
          userId: userId,
          message: `Order Being Prepared: Your order #${orderNumber} for ${routeState.drugName || 'Medication'} has been received by ${routeState.pharmacyName || 'Pharmacy'} and is being prepared.`,
          type: 'ORDER_BEING_PREPARED',
          provider: 'SYSTEM',
          status: 'SENT'
        }]);
      } catch (notifErr) {
        console.warn('Failed to insert initial notification:', notifErr);
      }

      console.info('[Payment] Mock payment succeeded', {
        deliveryId: delivery.id,
        prescriptionId,
        totalCost,
        reference,
        result
      });

      setStatus('Mock payment successful! Your pharmacy order is being prepared.');
      navigate(`/mock-delivery/${delivery.id}`, {
        replace: true,
        state: { delivery: { ...delivery, orderNumber, pharmacyName: routeState.pharmacyName || 'PharmaFind Pharmacy', drugName: routeState.drugName || 'Medication', deliveryAddress: 'Legon, Accra' } }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process mock payment.';
      console.error('[Payment] Mock payment handler error', { message, error });
      setErrorMessage(message);
      setStatus('Mock payment failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayment = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      if (isMockPaymentMode) {
        setStatus('Mock payment ready. Select an outcome.');
        setIsMockModalOpen(true);
        setIsSubmitting(false);
        return;
      }

      setStatus('Connecting to secure payment provider...');

      const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
      console.info('[Payment] Initializing payment', { publicKey: publicKey ? 'configured' : 'MISSING' });
      if (!publicKey) {
        throw new Error('Paystack public key is not configured. Please add VITE_PAYSTACK_PUBLIC_KEY to the client environment.');
      }

      const user = getUser();
      const email = user?.email || 'customer@example.com';
      const reference = `pharmafind_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      console.info('[Payment] Initializing payment on server', {
        email,
        totalCost,
        reference,
        prescriptionId: routeState.prescriptionId,
        amountInPesewas: Math.round(totalCost * 100)
      });

      const paymentResponse = await api.post('/payments/initialize', {
        prescriptionId: routeState.prescriptionId,
        amountGhs: Number(totalCost.toFixed(2)),
        email,
        reference
      });

      console.info('[Payment] Server initialization response', {
        paymentId: paymentResponse.data?.payment?.id,
        gatewayReference: paymentResponse.data?.gateway?.data?.reference,
        authorizationUrl: paymentResponse.data?.gateway?.data?.authorization_url
      });

      console.info('[Payment] Server initialization successful, showing Paystack modal');

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
          console.info('[Payment] User closed Paystack modal');
          setStatus('Payment cancelled.');
          setIsSubmitting(false);
        },
        callback: async (response: { reference?: string; status?: string; trxref?: string }) => {
          try {
            const verificationRef = response.reference || response.trxref || reference;
            console.info('[Payment] Paystack callback received', {
              responseReference: response.reference,
              responseStatus: response.status,
              responseTrxref: response.trxref,
              verificationRef
            });

            setStatus('Verifying payment with server...');
            console.info('[Payment] Calling server verification endpoint', { verificationRef });
            const verification = await api.get(`/payments/${verificationRef}/verify`);

            console.info('[Payment] Verification response received', {
              verificationData: verification.data,
              paymentStatus: verification.data?.status
            });

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
              console.info('[Payment] Creating non-Rx prescription', {
                drugId: routeState.drugId,
                pharmacyId: routeState.pharmacyId,
                quantity,
                drugName: routeState.drugName
              });
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

            console.info('[Payment] Creating delivery request', { prescriptionId, userId: authData.user.id });
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

            console.info('[Payment] Payment flow complete - SUCCESS', {
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
            console.error('[Payment] Payment callback error', { message, error: callbackError });
            setErrorMessage(message);
            setStatus('Payment verification failed');
          } finally {
            setIsSubmitting(false);
          }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process payment.';
      console.error('[Payment] Payment handler error', { message, error });
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

        {isMockPaymentMode && (
          <div className="mb-6 rounded-[20px] border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900">
            DEV MODE • MOCK PAYMENT ACTIVE
          </div>
        )}

        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6 space-y-5">
          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Medicine</div>
            <div className="mt-3 text-lg font-black text-slate-900">{routeState.drugName ?? 'Selected medicine'}</div>
            <div className="mt-2 text-sm text-slate-600">Pharmacy: {routeState.pharmacyName ?? 'Selected pharmacy'}</div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Cost breakdown</div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Medicine ({quantity}x)</span>
                <span className="font-semibold text-slate-900">GH₵ {subtotal.toFixed(2)}</span>
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

          <div className="rounded-[24px] border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">{isMockPaymentMode ? 'Mock payment mode' : 'Paystack'}</div>
                <div className="text-xs text-slate-500">{isMockPaymentMode ? 'Developer simulation gateway' : 'Secure payment gateway'}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-4 text-xs text-slate-600">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600 mt-0.5" />
              <div>
                By completing this payment, you authorize PharmaFind to process your order and arrange delivery to your specified address.
              </div>
            </div>
          </div>
        </div>

        {isMockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="mb-5 text-xl font-black text-slate-900">Payment simulation</div>

              <div className="space-y-3 rounded-[20px] border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Drug cost</span>
                  <span className="font-semibold text-slate-900">GH₵ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery fee</span>
                  <span className="font-semibold text-slate-900">GH₵ {deliveryFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-black text-emerald-700">
                  <span>Total amount</span>
                  <span>GH₵ {totalCost.toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => simulateMockPayment('success')}
                  className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Simulate Successful Payment
                </button>
                <button
                  type="button"
                  onClick={() => simulateMockPayment('failed')}
                  className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Simulate Failed Payment
                </button>
              </div>
            </div>
          </div>
        )}

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

        {!isMockPaymentMode && (
          <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            <div className="font-semibold mb-2">🔒 Secure Payment</div>
            Your payment information is encrypted and processed securely through Paystack.
          </div>
        )}

        <div className="mt-4 text-center text-xs text-slate-500">
          Status: <span className="font-semibold text-slate-600">{status}</span>
        </div>
      </div>
    </main>
  );
}
