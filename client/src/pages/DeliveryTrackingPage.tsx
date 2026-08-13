import { AlertCircle, Clock3, Loader2, PackageCheck, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MapView } from '../components/MapView';
import { getDeliveries } from '../lib/data';

interface DeliveryWithGPS {
  id: string;
  status: string;
  requestedAt?: string;
  updatedAt?: string;
  gpsLocations?: Array<{ latitude: number; longitude: number; createdAt: string }>;
}

export function DeliveryTrackingPage() {
  const [delivery, setDelivery] = useState<DeliveryWithGPS | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDelivery = async () => {
      try {
        setLoading(true);
        setError(null);
        const deliveries = await getDeliveries();
        if (deliveries.length > 0) {
          // Get the first (most recent) delivery
          setDelivery(deliveries[0]);
        } else {
          setError('No deliveries found');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load delivery data');
      } finally {
        setLoading(false);
      }
    };

    fetchDelivery();
  }, []);

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

  // Build route stops from GPS locations
  const routeStops = (delivery.gpsLocations || []).map((loc, idx) => ({
    lat: loc.latitude,
    lng: loc.longitude,
    label: `Location ${idx + 1}`
  }));

  const centerCoords = routeStops.length > 0
    ? [routeStops[0].lat, routeStops[0].lng] as [number, number]
    : [0, 0] as [number, number];

  // Build timeline from status
  const timeline = [
    { title: 'Order confirmed', detail: 'Prescription verified and ready for pickup', time: new Date(delivery.requestedAt).toLocaleTimeString(), state: 'Completed' },
    { title: 'Driver assigned', detail: 'Delivery driver has been assigned to this order', time: new Date(delivery.requestedAt).toLocaleTimeString(), state: delivery.status !== 'REQUESTED' ? 'Completed' : 'Pending' },
    { title: 'In transit', detail: 'Package is currently on its way to you', time: new Date(delivery.updatedAt).toLocaleTimeString(), state: delivery.status === 'IN_TRANSIT' ? 'Live' : 'Pending' },
    { title: 'Out for delivery', detail: 'Driver is approaching your location', time: new Date(delivery.updatedAt).toLocaleTimeString(), state: delivery.status === 'IN_TRANSIT' ? 'Live' : 'Pending' }
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 rounded-[30px] border border-slate-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Delivery tracking</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Prescription in transit</h1>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Delivery secure and monitored
          </div>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-slate-200 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="mb-3 flex items-center justify-between px-2 pt-1">
              <div className="text-sm font-semibold text-slate-700">Route overview</div>
              <div className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">Live</div>
            </div>
            <MapView points={routeStops} center={centerCoords} />
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">Timeline</h2>
              <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">
                Status: {delivery.status}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {timeline.map((item, index) => (
                <motion.div
                  key={`${item.title}-${index}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex gap-4"
                >
                  <div className="flex flex-col items-center">
                    <div className={`mt-1 flex h-4 w-4 items-center justify-center rounded-full ${item.state === 'Completed' || item.state === 'Live' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    {index !== timeline.length - 1 && <div className="mt-2 h-full w-px bg-slate-200" />}
                  </div>

                  <div className="flex-1 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-700">
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

        <aside className="space-y-6">
          <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-lg shadow-sky-200">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Delivery ID</div>
                <div className="text-xl font-black text-slate-900">{delivery.id.slice(0, 8).toUpperCase()}</div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {delivery.status}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Locations tracked</div>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {routeStops.length} GPS points
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl bg-sky-50 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-sky-700">Current status</div>
                <div className="mt-2 text-lg font-black text-sky-800">{delivery.status === 'IN_TRANSIT' ? 'In transit' : delivery.status}</div>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700">Data source</div>
                <div className="mt-2 text-lg font-black text-emerald-800">Supabase</div>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
            <h2 className="text-xl font-black text-slate-900">Delivery details</h2>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                <span className="text-sm text-slate-500">Created</span>
                <span className="text-sm font-semibold text-slate-800">{new Date(delivery.requestedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                <span className="text-sm text-slate-500">Updated</span>
                <span className="text-sm font-semibold text-slate-800">{new Date(delivery.updatedAt).toLocaleTimeString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                <span className="text-sm text-slate-500">GPS Points</span>
                <span className="text-sm font-semibold text-slate-800">{routeStops.length}</span>
              </div>
            </div>

            <button type="button" className="mt-5 flex w-full items-center justify-center gap-2 bg-slate-900 px-4 py-3 text-sm font-semibold text-white rounded-full hover:bg-slate-800 transition">
              <PackageCheck className="h-4 w-4" />
              Refresh delivery info
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}
