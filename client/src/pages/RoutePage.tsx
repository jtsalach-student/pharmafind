import { ArrowLeft, Clock3, MapPin, Navigation, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { calculateDistance, estimateDeliveryTime, type Coordinates } from '../lib/geolocation';

type RouteState = {
  pharmacy?: {
    id: string;
    name: string;
    address: string;
    phone: string;
    latitude: number;
    longitude: number;
  };
  userLocation?: Coordinates | null;
};

export function RoutePage() {
  const navigate = useNavigate();
  const locationState = useLocation();
  const state = (locationState.state as RouteState | null) ?? {};

  const pharmacy = state.pharmacy ?? null;
  const userLocation = state.userLocation ?? null;
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!pharmacy || !userLocation) {
      return;
    }

    const distance = calculateDistance(userLocation, {
      latitude: pharmacy.latitude,
      longitude: pharmacy.longitude
    });

    setDistanceKm(Number(distance.toFixed(1)));
    setEtaMinutes(estimateDeliveryTime(distance));
  }, [pharmacy, userLocation]);

  if (!pharmacy) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-700">
          No route data was found for this pharmacy.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <button type="button" onClick={() => navigate(-1)} className="secondary-button flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h1 className="text-3xl font-black text-slate-900">Route to {pharmacy.name}</h1>
        <div className="w-24" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[32px] border border-slate-200 bg-white/80 p-5 shadow-[0_25px_70px_rgba(15,23,42,0.06)]">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl bg-sky-100 p-2 text-sky-700"><Navigation className="h-5 w-5" /></div>
            <h2 className="text-2xl font-black text-slate-900">Navigation</h2>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Start</div>
              <div className="mt-2 text-lg font-black text-slate-900">
                {userLocation ? `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}` : 'Current location unavailable'}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Destination</div>
              <div className="mt-2 text-lg font-black text-slate-900">{pharmacy.name}</div>
              <div className="mt-1 text-sm text-slate-600">{pharmacy.address}</div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Distance</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{distanceKm !== null ? `${distanceKm.toFixed(1)} km` : '—'}</div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">ETA</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{etaMinutes !== null ? `${etaMinutes} min` : '—'}</div>
              </div>
            </div>

            <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sky-700 font-semibold">
                <Navigation className="h-4 w-4" />
                Directions
              </div>
              <ol className="space-y-2 text-sm text-slate-700">
                <li>1. Head to the mapped start point using your current location.</li>
                <li>2. Follow the route to the pharmacy destination.</li>
                <li>3. Confirm the address and proceed with pickup or delivery.</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[28px] border border-slate-200 bg-white/80 p-5 shadow-[0_25px_70px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <MapPin className="h-5 w-5" />
              Pharmacy info
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div><span className="font-bold text-slate-900">Name:</span> {pharmacy.name}</div>
              <div><span className="font-bold text-slate-900">Address:</span> {pharmacy.address}</div>
              <div className="flex items-center gap-2"><Phone className="h-4 w-4" /><span>{pharmacy.phone}</span></div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const origin = userLocation ? `&origin=${userLocation.latitude},${userLocation.longitude}` : '';
              const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${pharmacy.latitude},${pharmacy.longitude}${origin}`;
              window.open(routeUrl, '_blank', 'noopener,noreferrer');
            }}
            className="primary-button w-full justify-center"
          >
            <Navigation className="mr-2 h-4 w-4" />
            Open in Google Maps
          </button>

          <div className="rounded-[28px] border border-slate-200 bg-white/80 p-5 shadow-[0_25px_70px_rgba(15,23,42,0.06)]">
            <div className="mb-2 flex items-center gap-2 text-slate-700 font-semibold">
              <Clock3 className="h-5 w-5" />
              Travel summary
            </div>
            <div className="text-sm text-slate-600">
              {distanceKm !== null && etaMinutes !== null
                ? `Estimated route time is ${etaMinutes} minutes over ${distanceKm.toFixed(1)} km.`
                : 'Waiting for route details.'}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
