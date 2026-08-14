import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle, Clock, Phone, Truck } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabase';

type DeliveryStatus = 'REQUESTED' | 'ASSIGNED' | 'COLLECTED' | 'IN_TRANSIT' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';

type DeliveryRecord = {
  id: string;
  orderId: string;
  drug: string;
  quantity: number;
  pharmacy: string;
  deliveryAddress: string;
  phoneNumber: string;
  amount: number;
  deliveryFee: number;
  total: number;
  driverName: string;
  driverPhone: string;
  vehicleType: string;
  status: DeliveryStatus;
  driverId: string | null;
};

type NotificationItem = {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
};

const stageOrder: DeliveryStatus[] = ['REQUESTED', 'ASSIGNED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];

const normalizeStatus = (status?: string | null): DeliveryStatus => {
  const value = (status ?? 'REQUESTED').toUpperCase();
  if (value === 'COMPLETED') return 'COMPLETED';
  if (value === 'DELIVERED') return 'DELIVERED';
  if (value === 'IN_TRANSIT') return 'IN_TRANSIT';
  if (value === 'COLLECTED') return 'COLLECTED';
  if (value === 'ASSIGNED') return 'ASSIGNED';
  if (value === 'CANCELLED') return 'CANCELLED';
  return 'REQUESTED';
};

const getDisplayStatus = (status: DeliveryStatus): string => {
  if (status === 'COMPLETED') return 'DELIVERED';
  return status;
};

const fetchDeliveryDetails = async (deliveryId: string): Promise<DeliveryRecord> => {
  const client = getSupabaseClient();

  const { data: delivery, error: deliveryError } = await client
    .from('DeliveryRequest')
    .select('*')
    .eq('id', deliveryId)
    .maybeSingle();

  if (deliveryError) throw deliveryError;
  if (!delivery) throw new Error('Delivery request not found.');

  const [prescriptionResult, userResult, pharmacyResult, drugResult, driverResult] = await Promise.all([
    delivery.prescriptionId
      ? client.from('Prescription').select('*').eq('id', delivery.prescriptionId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    delivery.userId
      ? client.from('User').select('id, fullName, phone').eq('id', delivery.userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    delivery.prescriptionId
      ? client.from('Prescription').select('pharmacyId, drugId, quantity, deliveryFee, phoneNumber, deliveryAddress, unitPrice').eq('id', delivery.prescriptionId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    delivery.prescriptionId
      ? client.from('Prescription').select('drugId').eq('id', delivery.prescriptionId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    delivery.driverId
      ? client.from('Driver').select('*').eq('id', delivery.driverId).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  const prescription = prescriptionResult.data;
  const user = userResult.data;
  const prescriptionDetails = pharmacyResult.data ?? prescription;
  const drugRef = drugResult.data ?? prescription;
  const driver = driverResult.data ?? null;
  const driverUser = driver && driver.userId
    ? await client.from('User').select('id, fullName, phone').eq('id', driver.userId).maybeSingle()
    : { data: null, error: null };

  const pharmacyId = prescriptionDetails?.pharmacyId ?? null;
  const pharmacy = pharmacyId
    ? await client.from('Pharmacy').select('id, name, latitude, longitude').eq('id', pharmacyId).maybeSingle()
    : { data: null, error: null };

  const drugId = drugRef?.drugId ?? null;
  const drug = drugId
    ? await client.from('Drug').select('id, genericName, brandName, price').eq('id', drugId).maybeSingle()
    : { data: null, error: null };

  const deliveryFee = Number(prescriptionDetails?.deliveryFee ?? 0);
  const quantity = Number(delivery.quantity ?? prescriptionDetails?.quantity ?? 1);
  const amount = Number(prescriptionDetails?.unitPrice ?? 0) * quantity;
  const displayStatus = normalizeStatus(delivery.status);

  return {
    id: delivery.id,
    orderId: `ORD-${delivery.id.slice(0, 8).toUpperCase()}`,
    drug: (drug.data?.genericName ?? drug.data?.brandName ?? 'Medication').toString(),
    quantity,
    pharmacy: pharmacy.data?.name ?? 'Pharmacy pending',
    deliveryAddress: delivery.deliveryAddress ?? prescriptionDetails?.deliveryAddress ?? 'Address unavailable',
    phoneNumber: delivery.phoneNumber ?? prescriptionDetails?.phoneNumber ?? user?.phone ?? 'No phone provided',
    amount,
    deliveryFee,
    total: amount + deliveryFee,
    driverName: driverUser.data?.fullName ?? 'Waiting for driver acceptance',
    driverPhone: driverUser.data?.phone ?? 'No driver assigned yet',
    vehicleType: driver?.vehicleType ?? 'Motorcycle',
    status: displayStatus,
    driverId: delivery.driverId ?? null
  };
};

export const MockDeliveryTrackingPage: React.FC = () => {
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const navigate = useNavigate();

  const [delivery, setDelivery] = useState<DeliveryRecord | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDelivered, setIsDelivered] = useState(false);

  useEffect(() => {
    if (!deliveryId) {
      setLoading(false);
      setError('Delivery ID is missing.');
      return;
    }

    let isMounted = true;

    const loadDelivery = async () => {
      try {
        setLoading(true);
        setError(null);
        const details = await fetchDeliveryDetails(deliveryId);
        if (!isMounted) return;
        setDelivery(details);
        setIsDelivered(details.status === 'DELIVERED' || details.status === 'COMPLETED');
        if (details.driverId) {
          setNotifications((prev) => prev.length === 0 ? [{ id: crypto.randomUUID(), message: 'A driver has accepted your request.', type: 'success' }] : prev);
        } else {
          setNotifications([{ id: crypto.randomUUID(), message: 'Waiting for a driver to accept your delivery request.', type: 'info' }]);
        }
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load tracking details.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadDelivery();

    const client = getSupabaseClient();
    const channel = client.channel(`delivery-tracking-${deliveryId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'DeliveryRequest', filter: `id=eq.${deliveryId}` },
      () => {
        void loadDelivery();
      }
    );
    void channel.subscribe();

    return () => {
      isMounted = false;
      client.removeChannel(channel);
    };
  }, [deliveryId]);

  const effectiveDelivery: DeliveryRecord = delivery ?? {
    id: deliveryId ?? 'UNKNOWN',
    orderId: 'ORD-LOADING',
    drug: 'Loading medication...',
    quantity: 0,
    pharmacy: 'Fetching pharmacy info...',
    deliveryAddress: 'Please wait while we load your delivery data.',
    phoneNumber: 'No contact yet',
    amount: 0,
    deliveryFee: 0,
    total: 0,
    driverName: 'Waiting for driver acceptance',
    driverPhone: 'No driver assigned yet',
    vehicleType: 'Motorcycle',
    status: 'REQUESTED',
    driverId: null
  };

  const statusBadge = getDisplayStatus(effectiveDelivery.status);

  const handleConfirmReceipt = () => {
    const confirmation: NotificationItem = {
      id: crypto.randomUUID(),
      message: 'Delivery confirmed. Thank you.',
      type: 'success'
    };
    setNotifications((prev) => [confirmation, ...prev].slice(0, 5));
    setTimeout(() => navigate('/dashboard'), 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{effectiveDelivery.orderId}</h1>
            <p className="text-sm text-slate-600">Driver: {effectiveDelivery.driverName}</p>
          </div>
          <span
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
              effectiveDelivery.status === 'DELIVERED' || effectiveDelivery.status === 'COMPLETED'
                ? 'bg-green-100 text-green-700'
                : effectiveDelivery.driverId
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
            {effectiveDelivery.driverId ? statusBadge : 'Waiting for driver acceptance'}
          </span>
        </div>
      </div>

      {error && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {loading && !delivery && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 shadow-xl text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            <p className="font-semibold text-slate-900">Loading delivery data...</p>
            <p className="text-xs text-slate-600 mt-2">Delivery ID: {deliveryId}</p>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Delivery route</h2>
                <span className="text-xs text-slate-500">{effectiveDelivery.driverId ? 'Driver assigned' : 'Awaiting acceptance'}</span>
              </div>
              <div className="h-64 rounded-lg bg-gradient-to-r from-sky-50 via-white to-emerald-50 p-4">
                <svg viewBox="0 0 400 220" className="h-full w-full">
                  <line x1="60" y1="60" x2="330" y2="160" stroke="#93c5fd" strokeWidth="4" strokeDasharray="8 8" />
                  <circle cx="60" cy="60" r="12" fill="#2563eb" />
                  <circle cx="330" cy="160" r="12" fill="#16a34a" />
                  <circle cx={effectiveDelivery.driverId ? 170 : 60} cy={effectiveDelivery.driverId ? 110 : 60} r="12" fill="#f59e0b" />
                  <text x="60" y="38" textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold">Pharmacy</text>
                  <text x="330" y="182" textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold">Patient</text>
                </svg>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
              <p className="mb-4 text-sm font-semibold text-slate-900">Delivery progress</p>
              <div className="space-y-3">
                {['REQUESTED', 'ASSIGNED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED'].map((step, index) => {
                  const active = stageOrder.indexOf(effectiveDelivery.status as DeliveryStatus) >= index;
                  const label = step === 'REQUESTED' ? 'Request created' : step === 'ASSIGNED' ? 'Driver assigned' : step === 'COLLECTED' ? 'Medication collected' : step === 'IN_TRANSIT' ? 'In transit' : 'Delivered';
                  return (
                    <div key={step} className="flex items-center gap-3">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${active ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {active ? '✓' : index + 1}
                      </div>
                      <span className={active ? 'text-sm font-medium text-slate-900' : 'text-sm text-slate-500'}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Driver details</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500">Name</p>
                  <p className="font-semibold text-slate-900">{effectiveDelivery.driverName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-600" />
                  <a href={`tel:${effectiveDelivery.driverPhone}`} className="text-sm text-blue-600 hover:underline">
                    {effectiveDelivery.driverPhone}
                  </a>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Vehicle</p>
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    <Truck className="h-4 w-4" />
                    {effectiveDelivery.vehicleType}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Updates</p>
              <div className="space-y-2">
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500">No updates yet.</p>
                ) : (
                  notifications.map((item) => (
                    <div key={item.id} className={`rounded p-2 text-xs ${item.type === 'success' ? 'bg-green-50 text-green-700' : item.type === 'warning' ? 'bg-yellow-50 text-yellow-700' : 'bg-blue-50 text-blue-700'}`}>
                      <div className="flex items-start gap-2">
                        {item.type === 'success' ? <CheckCircle className="mt-0.5 h-3.5 w-3.5" /> : item.type === 'warning' ? <AlertCircle className="mt-0.5 h-3.5 w-3.5" /> : <Clock className="mt-0.5 h-3.5 w-3.5" />}
                        <span>{item.message}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Order summary</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Drug</span>
                  <span className="font-semibold text-slate-900 text-right">{effectiveDelivery.drug}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Quantity</span>
                  <span className="font-semibold text-slate-900">{effectiveDelivery.quantity}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Pharmacy</span>
                  <span className="font-semibold text-slate-900 text-right">{effectiveDelivery.pharmacy}</span>
                </div>
                <div className="border-t border-slate-200 pt-2">
                  <div className="mb-1 flex justify-between">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="font-semibold text-slate-900">GH₵ {effectiveDelivery.amount.toFixed(2)}</span>
                  </div>
                  <div className="mb-2 flex justify-between">
                    <span className="text-slate-600">Delivery fee</span>
                    <span className="font-semibold text-slate-900">GH₵ {effectiveDelivery.deliveryFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between rounded bg-blue-50 p-2">
                    <span className="font-semibold text-slate-900">Total</span>
                    <span className="font-bold text-blue-600">GH₵ {effectiveDelivery.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Delivery address</p>
              <p className="text-sm text-slate-900">{effectiveDelivery.deliveryAddress}</p>
              <p className="mt-2 text-sm text-slate-600">{effectiveDelivery.phoneNumber}</p>
            </div>

            {(isDelivered || effectiveDelivery.status === 'DELIVERED' || effectiveDelivery.status === 'COMPLETED') && (
              <button
                onClick={handleConfirmReceipt}
                className="w-full rounded-lg bg-green-600 px-4 py-3 font-semibold text-white transition hover:bg-green-700"
              >
                Confirm receipt
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
