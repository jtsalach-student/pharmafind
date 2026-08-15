import { AlertCircle, ArrowLeft, Check, CreditCard, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PaystackPop from '@paystack/inline-js';
import { useCart } from '../contexts/CartContext';
import { analyzePharmacyMatches, type CartItem, type PharmacyMatchAnalysis } from '../lib/cart';
import { calculateDeliveryFee } from '../lib/geolocation';
import { api } from '../lib/api';
import { getUser } from '../lib/auth';
import { getSupabaseClient } from '../lib/supabase';
import { createInAppNotification, notifyUsersWithRole } from '../lib/notifications';

const MOCK_PAYMENT_MODE = true;
const isMockPaymentMode = MOCK_PAYMENT_MODE || import.meta.env.VITE_MOCK_PAYMENTS === 'true';

type CheckoutState = {
  cartItems: CartItem[];
};

export function CheckoutPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { cart, clearCart } = useCart();
  const checkoutState = (state as CheckoutState | null);

  const user = getUser();
  const [selectedPharmacy, setSelectedPharmacy] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PharmacyMatchAnalysis | null>(null);
  const [status, setStatus] = useState('Analyzing pharmacies...');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMockModalOpen, setIsMockModalOpen] = useState(false);
  const [mockTransactionRef, setMockTransactionRef] = useState('');

  const cartItems = checkoutState?.cartItems ?? cart.items;
  const { totalCost, medicationTotal, deliveryFee } = cart;

  // Analyze pharmacy matches
  useEffect(() => {
    if (cartItems.length === 0) {
      setErrorMessage('Your cart is empty. Please add items to continue.');
      navigate('/search', { replace: true });
      return;
    }

    try {
      setStatus('Analyzing pharmacy availability...');
      const analysisResult = analyzePharmacyMatches(cartItems, cartItems);
      setAnalysis(analysisResult);

      if (analysisResult.bestRecommendation) {
        setSelectedPharmacy(analysisResult.bestRecommendation.pharmacyId);
      }

      setStatus('');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to analyze pharmacies';
      setErrorMessage(msg);
      setStatus('');
    }
  }, [cartItems, navigate]);

  const selectedPharmacyData = analysis?.fullMatches
    .concat(analysis?.partialMatches ?? [])
    .find(p => p.pharmacyId === selectedPharmacy);

  const validateOrder = async (): Promise<boolean> => {
    try {
      setStatus('Validating order...');

      if (!selectedPharmacy) {
        setErrorMessage('Please select a pharmacy to continue.');
        setStatus('');
        return false;
      }

      if (!selectedPharmacyData) {
        setErrorMessage('Selected pharmacy data is invalid.');
        setStatus('');
        return false;
      }

      const supabase = getSupabaseClient();

      for (const item of selectedPharmacyData.matchedItems) {
        const { data: inv, error } = await supabase
          .from('Inventory')
          .select('quantity, isActive, isAvailable, expiryDate')
          .eq('drugId', item.drugId)
          .eq('pharmacyId', item.pharmacyId)
          .single();

        if (error || !inv) {
          setErrorMessage(`${item.drugName} is no longer available. Please review your cart.`);
          setStatus('');
          return false;
        }

        if (!inv.isActive || !inv.isAvailable) {
          setErrorMessage(`${item.drugName} at ${item.pharmacyName} is no longer available.`);
          setStatus('');
          return false;
        }

        if (inv.quantity < item.quantity) {
          setErrorMessage(`Only ${inv.quantity} units of ${item.drugName} available. Please adjust your order.`);
          setStatus('');
          return false;
        }

        if (inv.expiryDate) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const expiry = new Date(inv.expiryDate);
          expiry.setHours(0, 0, 0, 0);
          if (expiry < today) {
            setErrorMessage(`${item.drugName} stock has expired. Please choose another option.`);
            setStatus('');
            return false;
          }
        }
      }

      setStatus('');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Validation failed';
      setErrorMessage(msg);
      setStatus('');
      return false;
    }
  };

  const simulateMockPayment = async (): Promise<boolean> => {
    const isValid = await validateOrder();
    if (!isValid) return false;

    try {
      setStatus('Processing mock payment...');
      setIsMockModalOpen(true);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const mockRef = `MOCK-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
      setMockTransactionRef(mockRef);
      setStatus('Mock payment successful! Please confirm.');

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Mock payment failed';
      setErrorMessage(msg);
      setStatus('');
      setIsMockModalOpen(false);
      return false;
    }
  };

  const handleConfirmMockPayment = async () => {
    try {
      setStatus('Creating order...');

      if (!selectedPharmacyData) {
        setErrorMessage('Pharmacy selection is invalid.');
        setStatus('');
        return;
      }

      const supabase = getSupabaseClient();

      console.log('Creating order for pharmacy:', selectedPharmacyData.pharmacyName);
      console.log('Total items to create:', selectedPharmacyData.matchedItems.length);

      let firstDeliveryId: string | null = null;

      // Delivery fee is distance-based from the selected pharmacy
      const pharmacyDeliveryFee = calculateDeliveryFee(selectedPharmacyData.distanceKm);

      for (const item of selectedPharmacyData.matchedItems) {
        const splitDeliveryFee = pharmacyDeliveryFee / selectedPharmacyData.matchedItems.length;
        console.log('Checkout Item:', item);
        console.log('Item Unit Price (from Inventory.price):', item.unitPrice);
        console.log('Item Quantity:', item.quantity);
        console.log('Line Total:', item.unitPrice * item.quantity);
        console.log('Pharmacy Delivery Fee:', pharmacyDeliveryFee);
        console.log('Split Delivery Fee:', splitDeliveryFee);

        // Prescription only stores metadata — no pricing fields
        const orderData = {
          userId: user?.id,
          drugId: item.drugId,
          pharmacyId: item.pharmacyId,
          quantity: item.quantity,
          status: 'APPROVED',
          filePath: 'cart-checkout-' + Date.now(),
          originalFileName: `${item.drugName}-order.txt`,
          mimeType: 'text/plain',
          fileSize: 0,
          ocrText: 'Cart checkout - approved',
          ocrConfidence: 100
        };

        console.log('Order Data to insert:', orderData);

        const { data: prescription, error: prescError } = await supabase
          .from('Prescription')
          .insert([orderData])
          .select()
          .single();

        if (prescError) throw prescError;

        // DeliveryRequest stores delivery record
        const { data: delivery, error: deliveryError } = await supabase
          .from('DeliveryRequest')
          .insert([{
            userId: user?.id,
            prescriptionId: prescription.id,
            status: 'REQUESTED'
          }])
          .select()
          .single();

        if (deliveryError) throw deliveryError;

        if (!firstDeliveryId) {
          firstDeliveryId = delivery.id;
        }

        // Dispatch User Notification: Order Created
        if (user?.id) {
          void createInAppNotification(
            user.id,
            `Order Created: Your order #${item.drugName} has been placed successfully and sent for preparation at ${selectedPharmacyData.pharmacyName}.`,
            'ORDER_BEING_PREPARED'
          );
        }

        // Dispatch Pharmacist Notification: New Order Available
        void notifyUsersWithRole(
          'PHARMACIST',
          `New Order Available: Order for ${item.drugName} (${item.quantity} units) has been paid and is waiting for preparation.`,
          'NEW_ORDER_AVAILABLE'
        );

        console.log('Created Prescription and DeliveryRequest:', { prescriptionId: prescription.id, deliveryId: delivery.id });
      }

      setStatus('Order created successfully!');
      clearCart();

      setTimeout(() => {
        navigate('/deliveries/track', { replace: true });
      }, 1500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create order';
      console.error('Error creating order:', msg);
      setErrorMessage(msg);
      setStatus('');
      setIsMockModalOpen(false);
    }
  };

  const handlePayment = async () => {
    const isValid = await validateOrder();
    if (!isValid) return;

    if (isMockPaymentMode) {
      await simulateMockPayment();
      return;
    }

    if (!user || !selectedPharmacyData) {
      setErrorMessage('Missing user or pharmacy information.');
      return;
    }

    try {
      setStatus('Initializing payment...');
      setIsSubmitting(true);

      const popupResponse = await new Promise<any>((resolve, reject) => {
        const pop = new PaystackPop();
        pop.newTransaction({
          key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
          email: user.email,
          amount: Math.round(totalCost * 100),
          onClose: () => {
            reject(new Error('Payment window closed'));
          },
          onSuccess: (transaction: any) => {
            resolve(transaction);
          }
        });
      });

      setStatus('Verifying payment...');

      const response = await api.post('/api/payments/verify', {
        reference: popupResponse.reference
      });

      if (response.data.status === 'success') {
        setStatus('Payment confirmed. Creating orders...');

        const supabase = getSupabaseClient();

        console.log('Real Payment - Creating orders with transaction ref:', response.data.reference);

        let firstDeliveryId: string | null = null;

        // Delivery fee is distance-based from the selected pharmacy
        const pharmacyDeliveryFee = calculateDeliveryFee(selectedPharmacyData.distanceKm);

        for (const item of selectedPharmacyData.matchedItems) {
          const splitDeliveryFee = pharmacyDeliveryFee / selectedPharmacyData.matchedItems.length;
          console.log('Item:', item);
          console.log('Unit Price (from Inventory.price):', item.unitPrice);
          console.log('Quantity:', item.quantity);
          console.log('Line Total:', item.unitPrice * item.quantity);
          console.log('Split Delivery Fee:', splitDeliveryFee);

          // Prescription only stores metadata — no pricing fields
          const { data: prescription, error: prescError } = await supabase
            .from('Prescription')
            .insert([{
              userId: user.id,
              drugId: item.drugId,
              pharmacyId: item.pharmacyId,
              quantity: item.quantity,
              status: 'APPROVED',
              filePath: 'paystack-checkout-' + Date.now(),
              originalFileName: `${item.drugName}-order.txt`,
              mimeType: 'text/plain',
              fileSize: 0,
              ocrText: 'Paystack payment - approved',
              ocrConfidence: 100
            }])
            .select()
            .single();

          if (prescError) throw prescError;

          // DeliveryRequest stores delivery record
          const { data: delivery, error: deliveryError } = await supabase
            .from('DeliveryRequest')
            .insert([{
              userId: user.id,
              prescriptionId: prescription.id,
              status: 'REQUESTED'
            }])
            .select()
            .single();

          if (deliveryError) throw deliveryError;

          if (!firstDeliveryId) {
            firstDeliveryId = delivery.id;
          }

          console.log('Created Prescription and DeliveryRequest:', { prescriptionId: prescription.id, deliveryId: delivery.id });
        }

        setStatus('Order created! Redirecting...');
        clearCart();

        setTimeout(() => {
          navigate('/deliveries/track', { replace: true });
        }, 1500);
      } else {
        throw new Error('Payment verification failed');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Payment failed';
      console.error('Payment error:', msg);
      setErrorMessage(msg);
      setStatus('');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!analysis) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 p-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </main>
    );
  }

  const allPharmacies = [...analysis.fullMatches, ...analysis.partialMatches];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="mb-4 flex items-center gap-2 text-sky-600 hover:text-sky-700 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-3xl font-black text-slate-900">Checkout</h1>
          <p className="mt-1 text-slate-600">Select a pharmacy and complete your order</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Pharmacy Selection */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cart Summary */}
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Order Items ({cartItems.length})</h2>
            <div className="space-y-3">
              {cartItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start border-b border-slate-100 pb-3 last:border-0">
                  <div>
                    <p className="font-semibold text-slate-900">{item.drugName}</p>
                    <p className="text-sm text-slate-600">{item.brandName}</p>
                    {(item.drugType || item.strength) && (
                      <div className="mt-1 flex gap-1">
                        {item.drugType && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            {item.drugType}
                          </span>
                        )}
                        {item.strength && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                            {item.strength}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-600">Qty: {item.quantity}</p>
                    <p className="text-xs text-slate-500">GH₵ {item.unitPrice.toFixed(2)} each</p>
                    <p className="font-bold text-slate-900">GH₵ {item.subtotal.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pharmacy Matches */}
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Available Pharmacies</h2>

            {analysis.fullMatches.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-emerald-700 uppercase tracking-[0.1em] mb-3">
                  ✓ Full Match — All Items Available
                </h3>
                <div className="space-y-3">
                  {analysis.fullMatches.map((pharmacy) => {
                    const pharmDeliveryFee = calculateDeliveryFee(pharmacy.distanceKm);
                    return (
                      <div
                        key={pharmacy.pharmacyId}
                        onClick={() => setSelectedPharmacy(pharmacy.pharmacyId)}
                        className={`cursor-pointer rounded-2xl border-2 p-4 transition ${
                          selectedPharmacy === pharmacy.pharmacyId
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-bold text-slate-900">{pharmacy.pharmacyName}</h4>
                            <p className="text-sm text-slate-600">{pharmacy.address}</p>
                          </div>
                          {selectedPharmacy === pharmacy.pharmacyId && (
                            <Check className="h-5 w-5 text-emerald-600" />
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                          <div>
                            <p className="text-xs text-slate-500 font-semibold">Distance</p>
                            <p className="font-bold text-slate-900">{pharmacy.distanceKm.toFixed(1)} km</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 font-semibold">ETA</p>
                            <p className="font-bold text-slate-900">{pharmacy.etaMinutes} min</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 font-semibold">Status</p>
                            <p className={`font-bold ${pharmacy.pharmacyIsOpen ? 'text-emerald-600' : 'text-red-600'}`}>
                              {pharmacy.pharmacyIsOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 text-sm">
                          <p className="text-xs text-slate-500 font-semibold">Total Cost at This Pharmacy</p>
                          <p className="font-bold text-emerald-700">
                            GH₵ {(pharmacy.totalCostForPharmacy + pharmDeliveryFee).toFixed(2)}
                            <span className="text-xs font-normal text-slate-500 ml-1">
                              (incl. GH₵ {pharmDeliveryFee.toFixed(2)} delivery)
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {analysis.partialMatches.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-orange-700 uppercase tracking-[0.1em] mb-3">
                  ⚠ Partial Match — Some Items Available
                </h3>
                <div className="space-y-3">
                  {analysis.partialMatches.map((pharmacy) => (
                    <div
                      key={pharmacy.pharmacyId}
                      onClick={() => setSelectedPharmacy(pharmacy.pharmacyId)}
                      className={`cursor-pointer rounded-2xl border-2 p-4 transition ${
                        selectedPharmacy === pharmacy.pharmacyId
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-bold text-slate-900">{pharmacy.pharmacyName}</h4>
                          <p className="text-sm text-slate-600">{pharmacy.address}</p>
                        </div>
                        {selectedPharmacy === pharmacy.pharmacyId && (
                          <Check className="h-5 w-5 text-orange-600" />
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-2 mt-3 text-sm mb-3">
                        <div>
                          <p className="text-xs text-slate-500 font-semibold">Distance</p>
                          <p className="font-bold text-slate-900">{pharmacy.distanceKm.toFixed(1)} km</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-semibold">ETA</p>
                          <p className="font-bold text-slate-900">{pharmacy.etaMinutes} min</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-semibold">Match</p>
                          <p className="font-bold text-slate-900">{pharmacy.matchedCount}/{pharmacy.totalCount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 font-semibold">Status</p>
                          <p className={`font-bold ${pharmacy.pharmacyIsOpen ? 'text-emerald-600' : 'text-red-600'}`}>
                            {pharmacy.pharmacyIsOpen ? '🟢' : '🔴'}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm">
                        <p className="text-xs text-slate-500 font-semibold mb-1">Items Available:</p>
                        <div className="flex flex-wrap gap-1">
                          {pharmacy.matchedItems.map((item) => (
                            <span
                              key={`${item.drugId}-${item.pharmacyId}`}
                              className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded"
                            >
                              ✓ {item.drugName}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {allPharmacies.length === 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-red-700">No pharmacies found with any of these items.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Order Summary */}
        <div className="lg:col-span-1">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sticky top-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Order Summary</h2>

            {selectedPharmacyData && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600 font-semibold mb-1">Selected Pharmacy</p>
                <p className="font-bold text-slate-900">{selectedPharmacyData.pharmacyName}</p>
                <p className="text-sm text-slate-600">{selectedPharmacyData.address}</p>
                <p className="text-sm text-slate-500 mt-1">{selectedPharmacyData.distanceKm.toFixed(1)} km away</p>
              </div>
            )}

            <div className="space-y-3 border-b border-slate-200 pb-4 mb-4">
              <div className="flex justify-between text-slate-700">
                <span>Medication Total</span>
                <span className="font-semibold">GH₵ {medicationTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>
                  Delivery Fee
                  {selectedPharmacyData && (
                    <span className="block text-xs text-slate-400">
                      {selectedPharmacyData.distanceKm.toFixed(1)} km × GH₵ 1.50 + GH₵ 2.00 base
                    </span>
                  )}
                </span>
                <span className="font-semibold">
                  GH₵ {selectedPharmacyData
                    ? calculateDeliveryFee(selectedPharmacyData.distanceKm).toFixed(2)
                    : deliveryFee.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex justify-between text-lg mb-6">
              <span className="font-bold text-slate-900">Grand Total</span>
              <span className="font-bold text-emerald-700">
                GH₵ {selectedPharmacyData
                  ? (medicationTotal + calculateDeliveryFee(selectedPharmacyData.distanceKm)).toFixed(2)
                  : totalCost.toFixed(2)}
              </span>
            </div>

            {status && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                <p className="text-sm text-blue-700">{status}</p>
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 flex gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{errorMessage}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handlePayment}
              disabled={!selectedPharmacy || isSubmitting || !analysis?.fullMatches.length}
              className="primary-button w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  Proceed to Payment
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate(-1)}
              className="secondary-button w-full mt-3"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>

      {/* Mock Payment Modal */}
      {isMockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Mock Payment</h3>
              <button
                onClick={() => {
                  setIsMockModalOpen(false);
                  setStatus('');
                }}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X className="h-5 w-5 text-slate-600" />
              </button>
            </div>

            {status.includes('successful') ? (
              <div className="space-y-4">
                <div className="rounded-full w-16 h-16 bg-emerald-100 flex items-center justify-center mx-auto">
                  <Check className="h-8 w-8 text-emerald-600" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-emerald-700">Payment Successful!</p>
                  <p className="text-sm text-slate-600 mt-1">Reference: {mockTransactionRef}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Medicine Total</span>
                    <span className="font-semibold">GH₵ {medicationTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Delivery Fee</span>
                    <span className="font-semibold">
                      GH₵ {selectedPharmacyData
                        ? calculateDeliveryFee(selectedPharmacyData.distanceKm).toFixed(2)
                        : deliveryFee.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
                    <span>Grand Total</span>
                    <span className="text-emerald-700">
                      GH₵ {selectedPharmacyData
                        ? (medicationTotal + calculateDeliveryFee(selectedPharmacyData.distanceKm)).toFixed(2)
                        : totalCost.toFixed(2)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleConfirmMockPayment}
                  className="primary-button w-full"
                >
                  Confirm & Create Order
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-slate-600">Processing your payment...</p>
                <div className="flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}