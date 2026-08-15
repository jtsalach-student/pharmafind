import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Loader2, Phone, UserCheck } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabase';
import { calculateDeliveryFee, calculateDistance, resolveUserLocation } from '../lib/geolocation';
import { fetchRoadRoute, interpolatePositionAlongRoute, sendDeliveryNotification, type RoadRoute } from '../lib/routing';
import { MapView, type Point } from '../components/MapView';

type DeliveryStatus = 'REQUESTED' | 'ASSIGNED' | 'COLLECTED' | 'IN_TRANSIT' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';

type DeliveryRecord = {
  id: string;
  orderId: string;
  userId: string;
  drug: string;
  quantity: number;
  pharmacy: string;
  pharmacyCoords: [number, number];
  userCoords: [number, number];
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
  if (status === 'COMPLETED') return 'DELIVERED & CONFIRMED';
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
      ? client.from('Prescription').select('pharmacyId, drugId, quantity').eq('id', delivery.prescriptionId).maybeSingle()
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
    ? await client.from('Pharmacy').select('id, name, latitude, longitude, address').eq('id', pharmacyId).maybeSingle()
    : { data: null, error: null };

  const drugId = drugRef?.drugId ?? null;
  const [drug, inventory] = await Promise.all([
    drugId
      ? client.from('Drug').select('id, genericName, brandName, price').eq('id', drugId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    (pharmacyId && drugId)
      ? client.from('Inventory').select('price').eq('pharmacyId', pharmacyId).eq('drugId', drugId).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  const pharmCoords: [number, number] = (pharmacy.data?.latitude != null && pharmacy.data?.longitude != null)
    ? [pharmacy.data.latitude, pharmacy.data.longitude]
    : [5.6037, -0.1870];

  const userLocationObj = await resolveUserLocation();
  const userCoords: [number, number] = [userLocationObj.latitude, userLocationObj.longitude];

  console.log('[User Tracking] Pharmacy Coordinates:', pharmCoords);
  console.log('[User Tracking] Driver Coordinates:', pharmCoords);
  console.log('[User Tracking] User Coordinates:', userCoords);

  const distanceKm = Number(calculateDistance(
    { latitude: pharmCoords[0], longitude: pharmCoords[1] },
    { latitude: userCoords[0], longitude: userCoords[1] }
  ).toFixed(1));

  const unitPrice = Number(inventory.data?.price ?? drug.data?.price ?? 0);
  const deliveryFee = calculateDeliveryFee(distanceKm);
  const quantity = Number(delivery.quantity ?? prescriptionDetails?.quantity ?? 1);
  const amount = unitPrice * quantity;
  const displayStatus = normalizeStatus(delivery.status);

  return {
    id: delivery.id,
    orderId: `ORD-${delivery.id.slice(0, 8).toUpperCase()}`,
    userId: delivery.userId,
    drug: (drug.data?.genericName ?? drug.data?.brandName ?? 'Medication').toString(),
    quantity,
    pharmacy: pharmacy.data?.name ?? 'Pharmacy pending',
    pharmacyCoords: pharmCoords,
    userCoords: userCoords,
    deliveryAddress: delivery.deliveryAddress ?? pharmacy.data?.address ?? 'Legon, Accra',
    phoneNumber: delivery.phoneNumber ?? user?.phone ?? 'No phone provided',
    amount,
    deliveryFee,
    total: amount + deliveryFee,
    driverName: driverUser.data?.fullName ?? (delivery.driverId ? 'Assigned Courier' : 'Waiting for driver acceptance'),
    driverPhone: driverUser.data?.phone ?? '024 000 0000',
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
  const [isConfirming, setIsConfirming] = useState(false);

  // Road Navigation & Live Simulation states
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);
  const [driverPosition, setDriverPosition] = useState<[number, number]>([5.6037, -0.1870]);
  const [progressPercent, setProgressPercent] = useState(15);
  const [distanceRemaining, setDistanceRemaining] = useState<number>(2.5);
  const [etaRemaining, setEtaRemaining] = useState<number>(8);

  const simulationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!deliveryId) {
      setLoading(false);
      setError('Delivery ID is missing.');
      return;
    }

    let isMounted = true;

    const loadDelivery = async () => {
      try {
        setError(null);
        const details = await fetchDeliveryDetails(deliveryId);
        if (!isMounted) return;
        setDelivery(details);
        setDriverPosition(details.pharmacyCoords);

        // Fetch real road route
        fetchRoadRoute(details.pharmacyCoords, details.userCoords).then((route) => {
          if (isMounted && route) {
            setRoadRoute(route);
            setDistanceRemaining(route.distanceKm);
            setEtaRemaining(route.etaMinutes);
          }
        });

        // Fetch real user notifications from Notification table
        if (details.userId) {
          const { data: userNotifs } = await client
            .from('Notification')
            .select('id, message, type, createdAt')
            .eq('userId', details.userId)
            .order('createdAt', { ascending: false })
            .limit(6);

          if (userNotifs && userNotifs.length > 0) {
            setNotifications(
              userNotifs.map((n) => ({
                id: n.id,
                message: n.message,
                type: n.type === 'DELIVERED' || n.type === 'DELIVERY_COMPLETED' ? 'success' : 'info'
              }))
            );
          } else if (details.driverId) {
            setNotifications([
              { id: crypto.randomUUID(), message: 'A driver has accepted your delivery request.', type: 'success' }
            ]);
          } else {
            setNotifications([
              { id: crypto.randomUUID(), message: 'Order Being Prepared: Pharmacy is preparing your medication package.', type: 'info' }
            ]);
          }
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

    // Polling fallback to guarantee updates without page refresh
    const pollTimer = setInterval(() => {
      void loadDelivery();
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(pollTimer);
      client.removeChannel(channel);
    };
  }, [deliveryId]);

  // Live Driver Movement simulation along Road Route
  useEffect(() => {
    if (!delivery || !roadRoute || !['ASSIGNED', 'COLLECTED', 'IN_TRANSIT'].includes(delivery.status)) {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
        simulationRef.current = null;
      }
      return;
    }

    const coordinates = roadRoute.coordinates;
    const totalDist = roadRoute.distanceKm;

    simulationRef.current = window.setInterval(() => {
      setProgressPercent((prev) => {
        const next = Math.min(100, prev + 2.5);
        const fraction = next / 100;
        const { position } = interpolatePositionAlongRoute(coordinates, fraction);

        setDriverPosition(position);
        setDistanceRemaining(Number((totalDist * (1 - fraction)).toFixed(1)));
        setEtaRemaining(Math.max(1, Math.round(totalDist * (1 - fraction) * 3.2)));

        return next;
      });
    }, 2500);

    return () => {
      if (simulationRef.current) {
        clearInterval(simulationRef.current);
        simulationRef.current = null;
      }
    };
  }, [delivery?.status, roadRoute]);

  const effectiveDelivery: DeliveryRecord = delivery ?? {
    id: deliveryId ?? 'UNKNOWN',
    orderId: 'ORD-LOADING',
    userId: '',
    drug: 'Loading medication...',
    quantity: 0,
    pharmacy: 'Fetching pharmacy info...',
    pharmacyCoords: [5.6037, -0.1870],
    userCoords: [5.6506, -0.1870],
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

  const handleConfirmReceipt = async () => {
    if (!deliveryId) return;
    try {
      setIsConfirming(true);
      const client = getSupabaseClient();
      await client
        .from('DeliveryRequest')
        .update({ status: 'COMPLETED', updatedAt: new Date().toISOString() })
        .eq('id', deliveryId);

      if (effectiveDelivery.userId) {
        await sendDeliveryNotification(
          effectiveDelivery.userId,
          `Delivery confirmed for order #${effectiveDelivery.orderId}. Thank you!`,
          'DELIVERY_COMPLETED'
        );
      }

      const confirmation: NotificationItem = {
        id: crypto.randomUUID(),
        message: 'Delivery confirmed. Thank you!',
        type: 'success'
      };
      setNotifications((prev) => [confirmation, ...prev].slice(0, 5));
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err) {
      console.error('Error confirming receipt:', err);
    } finally {
      setIsConfirming(false);
    }
  };

  const mapPoints: Point[] = [
    { lat: effectiveDelivery.pharmacyCoords[0], lng: effectiveDelivery.pharmacyCoords[1], label: effectiveDelivery.pharmacy, type: 'pharmacy' },
    { lat: effectiveDelivery.userCoords[0], lng: effectiveDelivery.userCoords[1], label: 'Your Address', type: 'user' }
  ];

  if (loading && !delivery) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600 mb-3" />
          <p className="font-bold text-slate-900">Loading delivery details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top sticky banner */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{effectiveDelivery.orderId}</h1>
            <p className="text-sm text-slate-600">Rider: {effectiveDelivery.driverName}</p>
          </div>
          <span
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
              effectiveDelivery.status === 'DELIVERED' || effectiveDelivery.status === 'COMPLETED'
                ? 'bg-emerald-100 text-emerald-700'
                : effectiveDelivery.driverId
                ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-100 text-amber-700'
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

      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left 2 Cols: Live Map & Progress */}
          <div className="space-y-6 lg:col-span-2">
            {/* Road Network Leaflet Map */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Road Network Navigation</h2>
                  <p className="text-xs text-slate-500">Live GPS tracking along actual streets</p>
                </div>
                <div className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 animate-pulse">
                  {effectiveDelivery.driverId ? '🏍️ Driver En Route' : '⏳ Awaiting Dispatch'}
                </div>
              </div>

              {/* Map View */}
              <MapView
                points={mapPoints}
                center={driverPosition}
                driverPosition={driverPosition}
                showRoute={true}
                className="h-80 w-full rounded-xl border"
              />

              {/* Real-time Distance & ETA */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Distance Remaining</p>
                  <p className="text-lg font-black text-slate-900">{distanceRemaining} km</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Est. Arrival</p>
                  <p className="text-lg font-black text-sky-600">~{etaRemaining} min</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Status</p>
                  <p className="text-lg font-black text-emerald-600">{effectiveDelivery.status}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full rounded-full bg-slate-100 h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Confirm Receipt Banner (when Delivered) */}
            {(effectiveDelivery.status === 'DELIVERED' || effectiveDelivery.status === 'COMPLETED') && (
              <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-6 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <UserCheck className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-black text-slate-900">Driver Has Arrived!</h3>
                <p className="text-sm text-slate-600">
                  Please verify your package and confirm receipt below.
                </p>
                {effectiveDelivery.status !== 'COMPLETED' && (
                  <button
                    type="button"
                    disabled={isConfirming}
                    onClick={handleConfirmReceipt}
                    className="primary-button bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-2.5"
                  >
                    {isConfirming ? 'Confirming...' : '✓ Confirm Receipt of Order'}
                  </button>
                )}
              </div>
            )}

            {/* Delivery Progress Steps */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="mb-4 text-sm font-bold text-slate-900">Delivery Progression</p>
              <div className="space-y-3">
                {['REQUESTED', 'ASSIGNED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED'].map((step, index) => {
                  const active = stageOrder.indexOf(effectiveDelivery.status as DeliveryStatus) >= index;
                  const label =
                    step === 'REQUESTED'
                      ? '1. Order Being Prepared'
                      : step === 'ASSIGNED'
                      ? '2. Order Ready For Pickup'
                      : step === 'COLLECTED'
                      ? '3. Driver Collected Medicine'
                      : step === 'IN_TRANSIT'
                      ? '4. Delivery Started (In Transit)'
                      : '5. Delivered to Destination';
                  return (
                    <div key={step} className="flex items-center gap-3">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                          active ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {active ? '✓' : index + 1}
                      </div>
                      <span className={active ? 'text-sm font-semibold text-slate-900' : 'text-sm text-slate-500'}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Col: Driver Details & Order Summary */}
          <div className="space-y-6">
            {/* Driver Contact Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Driver & Vehicle</p>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Name</p>
                  <p className="font-bold text-slate-900">{effectiveDelivery.driverName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Vehicle</p>
                  <p className="font-semibold text-slate-800">🏍️ {effectiveDelivery.vehicleType}</p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Phone className="h-4 w-4 text-emerald-600" />
                  <a href={`tel:${effectiveDelivery.driverPhone}`} className="text-sm font-semibold text-blue-600 hover:underline">
                    {effectiveDelivery.driverPhone}
                  </a>
                </div>
              </div>
            </div>

            {/* Order Summary & Pricing */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Order Summary</p>

              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-900">{effectiveDelivery.drug}</p>
                <p className="text-xs text-slate-500">Qty: {effectiveDelivery.quantity} unit(s)</p>
                <p className="text-xs text-emerald-700 font-semibold mt-1">From: {effectiveDelivery.pharmacy}</p>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Medicine Total:</span>
                  <span className="font-semibold text-slate-900">GH₵ {effectiveDelivery.amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Fee:</span>
                  <span className="font-semibold text-slate-900">GH₵ {effectiveDelivery.deliveryFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-sm text-slate-900">
                  <span>Grand Total:</span>
                  <span className="text-emerald-700">GH₵ {effectiveDelivery.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Notification Stream */}
            {notifications.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Live Updates</p>
                <div className="space-y-2">
                  {notifications.map((n) => (
                    <div key={n.id} className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                      {n.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MockDeliveryTrackingPage;
