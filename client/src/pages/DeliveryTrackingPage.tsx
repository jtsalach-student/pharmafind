import { AlertCircle, ArrowLeft, Clock3, Loader2, ShieldCheck, UserCheck } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { MapView, type Point } from '../components/MapView';
import { getDeliveries, type DeliveryRecord } from '../lib/data';
import { calculateDeliveryFee, resolveUserLocation } from '../lib/geolocation';
import { getSupabaseClient } from '../lib/supabase';
import { fetchRoadRoute, interpolatePositionAlongRoute, sendDeliveryNotification, type RoadRoute } from '../lib/routing';

export function DeliveryTrackingPage() {
  const [delivery, setDelivery] = useState<DeliveryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Live simulation states
  const [progressPercent, setProgressPercent] = useState(15);
  const [driverPosition, setDriverPosition] = useState<[number, number]>([5.6037, -0.1870]);
  const [pharmacyCoords, setPharmacyCoords] = useState<[number, number]>([5.6037, -0.1870]);
  const [userCoords, setUserCoords] = useState<[number, number]>([5.6506, -0.1870]);
  const [remainingDistance, setRemainingDistance] = useState<number>(3.0);
  const [remainingEta, setRemainingEta] = useState<number>(10);
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);

  const simulationRef = useRef<number | null>(null);

  const fetchDelivery = async () => {
    try {
      setError(null);
      const [deliveries, userLoc] = await Promise.all([
        getDeliveries(),
        resolveUserLocation()
      ]);

      const resolvedUser: [number, number] = [userLoc.latitude, userLoc.longitude];
      setUserCoords(resolvedUser);

      if (deliveries.length > 0) {
        const latest = deliveries[0];
        setDelivery(latest);

        const pharmLoc: [number, number] = (latest.prescription?.pharmacy?.latitude != null && latest.prescription?.pharmacy?.longitude != null)
          ? [latest.prescription.pharmacy.latitude, latest.prescription.pharmacy.longitude]
          : [5.6037, -0.1870];

        setPharmacyCoords(pharmLoc);

        console.log('Pharmacy Coordinates:', pharmLoc);
        console.log('Driver Coordinates:', pharmLoc);
        console.log('User Coordinates:', resolvedUser);

        fetchRoadRoute(pharmLoc, resolvedUser).then((route) => {
          setRoadRoute(route);
          setRemainingDistance(route.distanceKm);
          setRemainingEta(route.etaMinutes);
          if (latest.status === 'ASSIGNED' || latest.status === 'REQUESTED') {
            setDriverPosition(pharmLoc);
          }
        });
      } else {
        setError('No active delivery requests found.');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to load delivery data';
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDelivery();

    // Subscribe to realtime updates on DeliveryRequest
    const client = getSupabaseClient();
    const channel = client.channel('user-delivery-tracking');
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'DeliveryRequest' }, () => {
      void fetchDelivery();
    });
    void channel.subscribe();

    // Polling fallback to guarantee instant updates without refresh
    const pollInterval = setInterval(() => {
      void fetchDelivery();
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      client.removeChannel(channel);
    };
  }, []);

  // Run simulated driver movement when IN_TRANSIT
  useEffect(() => {
    if (!delivery || delivery.status !== 'IN_TRANSIT' || !roadRoute) {
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
        setRemainingDistance(Number((totalDist * (1 - fraction)).toFixed(1)));
        setRemainingEta(Math.max(1, Math.round(totalDist * (1 - fraction) * 3.2)));

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

  // User Confirms Receipt -> transitions to COMPLETED
  const handleConfirmReceipt = async () => {
    if (!delivery) return;
    try {
      setConfirming(true);
      const client = getSupabaseClient();

      const { error: updateError } = await client
        .from('DeliveryRequest')
        .update({ status: 'COMPLETED', updatedAt: new Date().toISOString() })
        .eq('id', delivery.id);

      if (updateError) throw updateError;

      await sendDeliveryNotification(
        delivery.userId,
        'Thank you! You have confirmed receipt of your prescription order.',
        'DELIVERY_COMPLETED'
      );

      setSuccessNotice('Delivery completed and confirmed! Thank you.');
      await fetchDelivery();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm delivery.');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 p-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </main>
    );
  }

  if (error || !delivery) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex gap-3 rounded-[28px] border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Error loading delivery</h3>
            <p className="text-sm text-red-700">{error || 'No active delivery found'}</p>
          </div>
        </div>
      </main>
    );
  }

  const pharmPoint: Point = {
    lat: pharmacyCoords[0],
    lng: pharmacyCoords[1],
    label: delivery.prescription?.pharmacy?.name ?? 'Pickup Pharmacy',
    type: 'pharmacy'
  };

  const userPoint: Point = {
    lat: userCoords[0],
    lng: userCoords[1],
    label: 'Your Delivery Address',
    type: 'user'
  };

  const mapPoints: Point[] = [pharmPoint, userPoint];

  // Timeline progression
  const getTimelineState = (stepStatus: string) => {
    const statusOrder = ['REQUESTED', 'ASSIGNED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
    const currentIdx = statusOrder.indexOf(delivery.status);
    const stepIdx = statusOrder.indexOf(stepStatus);

    if (currentIdx > stepIdx) return 'Completed';
    if (currentIdx === stepIdx) return 'Live';
    return 'Pending';
  };

  const timeline = [
    {
      title: '1. Order Being Prepared',
      detail: 'Pharmacy has received your order and is preparing the medication',
      time: new Date(delivery.requestedAt || delivery.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      state: getTimelineState('REQUESTED')
    },
    {
      title: '2. Order Ready For Pickup',
      detail: 'Package is packed and waiting for courier collection at the pharmacy',
      time: delivery.updatedAt ? new Date(delivery.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
      state: getTimelineState('ASSIGNED')
    },
    {
      title: '3. Driver Collected Medicine',
      detail: 'Courier has arrived at the pharmacy and collected your medication',
      time: delivery.updatedAt ? new Date(delivery.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
      state: getTimelineState('COLLECTED')
    },
    {
      title: '4. Delivery Started (In Transit)',
      detail: 'Rider is driving along the road route to your location',
      time: delivery.updatedAt ? new Date(delivery.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
      state: getTimelineState('IN_TRANSIT')
    },
    {
      title: '5. Delivered',
      detail: 'Rider has arrived at your destination address',
      time: delivery.updatedAt ? new Date(delivery.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
      state: getTimelineState('DELIVERED')
    }
  ];

  const unitPrice = Number(delivery.prescription?.drug?.price ?? 0);
  const quantity = Number(delivery.prescription?.quantity ?? 1);
  const deliveryFee = calculateDeliveryFee(delivery.distanceKm ?? remainingDistance ?? 2.5);
  const lineTotal = unitPrice * quantity;
  const grandTotal = lineTotal + deliveryFee;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-600 hover:text-sky-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header Banner */}
      <div className="mb-6 rounded-[30px] border border-slate-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Live Delivery Tracking</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              {delivery.status === 'COMPLETED' ? 'Delivery Completed' : 'Prescription En Route'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">Order ID: ORD-{delivery.id.slice(0, 8).toUpperCase()}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              Live Monitored Dispatch
            </div>
            <span className="rounded-full bg-blue-100 px-3 py-2 text-xs font-bold text-blue-700">
              Status: {delivery.status}
            </span>
          </div>
        </div>
      </div>

      {successNotice && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          ✓ {successNotice}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        {/* Left Col: Live Map & Timeline */}
        <div className="space-y-6">
          {/* Map Overview */}
          <div className="rounded-[30px] border border-slate-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">Road Network Navigation</div>
              <div className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700 animate-pulse">
                Live GPS Active
              </div>
            </div>

            {/* MapView with Road Route and Animated Driver */}
            <MapView
              points={mapPoints}
              center={driverPosition}
              driverPosition={driverPosition}
              showRoute={true}
              className="h-80 w-full rounded-2xl border"
            />

            {/* Live Metrics */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3 text-center border border-slate-100">
                <p className="text-[10px] uppercase font-bold text-slate-500">Remaining</p>
                <p className="text-lg font-black text-slate-900">{remainingDistance} km</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 text-center border border-slate-100">
                <p className="text-[10px] uppercase font-bold text-slate-500">Est. Arrival</p>
                <p className="text-lg font-black text-sky-600">~{remainingEta} min</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 text-center border border-slate-100">
                <p className="text-[10px] uppercase font-bold text-slate-500">Driver State</p>
                <p className="text-lg font-black text-emerald-600">{delivery.status}</p>
              </div>
            </div>

            {/* Live Progress Bar */}
            <div className="mt-4 w-full rounded-full bg-slate-100 h-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-2 transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Confirm Receipt Banner (when Delivered) */}
          {delivery.status === 'DELIVERED' && (
            <div className="rounded-[28px] border-2 border-emerald-400 bg-emerald-50 p-6 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <UserCheck className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Driver Has Arrived!</h3>
              <p className="text-sm text-slate-600">
                Please verify your medicine package and confirm receipt below.
              </p>
              <button
                type="button"
                disabled={confirming}
                onClick={handleConfirmReceipt}
                className="primary-button bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3"
              >
                {confirming ? 'Confirming...' : '✓ Confirm Receipt of Order'}
              </button>
            </div>
          )}

          {/* Timeline */}
          <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
            <h2 className="text-xl font-black text-slate-900 mb-4">Delivery Progression</h2>
            <div className="space-y-4">
              {timeline.map((item, index) => (
                <motion.div
                  key={`${item.title}-${index}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex gap-4"
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full ${
                        item.state === 'Completed'
                          ? 'bg-emerald-500'
                          : item.state === 'Live'
                          ? 'bg-blue-500 animate-pulse ring-4 ring-blue-100'
                          : 'bg-slate-300'
                      }`}
                    />
                    {index !== timeline.length - 1 && <div className="mt-2 h-full w-px bg-slate-200" />}
                  </div>

                  <div className="flex-1 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                      <span
                        className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${
                          item.state === 'Completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.state === 'Live'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {item.state}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">{item.detail}</div>
                    <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      {item.time}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: Cost Breakdown & Medicine Details */}
        <div className="space-y-6">
          <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
            <h2 className="text-xl font-black text-slate-900 mb-4">Order & Cost Breakdown</h2>

            {delivery.prescription?.drug && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 mb-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700 font-bold">Medicine</div>
                <div className="mt-1 text-base font-bold text-slate-900">
                  {delivery.prescription.drug.genericName}
                </div>
                {delivery.prescription.drug.brandName && (
                  <div className="text-xs text-slate-600">{delivery.prescription.drug.brandName}</div>
                )}
                {(delivery.prescription.drug.strength || delivery.prescription.drug.drugType) && (
                  <div className="mt-2 flex gap-1.5 text-xs">
                    {delivery.prescription.drug.drugType && (
                      <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-700">
                        {delivery.prescription.drug.drugType}
                      </span>
                    )}
                    {delivery.prescription.drug.strength && (
                      <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-700">
                        {delivery.prescription.drug.strength}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 border-t border-slate-200 pt-4 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Unit Price (Inventory.price)</span>
                <span className="font-semibold text-slate-900">GH₵ {unitPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Quantity</span>
                <span className="font-semibold text-slate-900">{quantity} unit(s)</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-slate-700 font-medium">
                <span>Line Total</span>
                <span className="font-bold text-emerald-700">GH₵ {lineTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>
                  Delivery Fee
                  <span className="block text-[11px] text-slate-400">Distance-based ({remainingDistance} km)</span>
                </span>
                <span className="font-semibold text-slate-900">GH₵ {deliveryFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-slate-200 pt-3 text-base font-black">
                <span className="text-slate-900">Grand Total</span>
                <span className="text-emerald-700">GH₵ {grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
