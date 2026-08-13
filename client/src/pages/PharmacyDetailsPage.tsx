import { ArrowLeft, Clock, MapPin, Navigation, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { calculateDistance, estimateDeliveryTime, type Coordinates } from '../lib/geolocation';
import { getSupabaseClient } from '../lib/supabase';
import { MapView } from '../components/MapView';

type PharmacyDetail = {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  opensAt: string;
  closesAt: string;
};

export function PharmacyDetailsPage() {
  const { pharmacyId } = useParams<{ pharmacyId: string }>();
  const navigate = useNavigate();
  const locationState = useLocation();

  const [pharmacy, setPharmacy] = useState<PharmacyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  useEffect(() => {
    const loadPharmacyData = async () => {
      if (!pharmacyId) {
        setError('Pharmacy ID is missing');
        setLoading(false);
        return;
      }

      try {
        const client = getSupabaseClient();
        const { data, error: fetchError } = await client
          .from('Pharmacy')
          .select('id, name, address, phone, latitude, longitude, opensAt, closesAt')
          .eq('id', pharmacyId)
          .single();

        if (fetchError || !data) {
          throw new Error('Pharmacy not found');
        }

        const pharmacyData = data as PharmacyDetail;
        setPharmacy(pharmacyData);

        const passedLocation = (locationState.state as { userLocation?: Coordinates } | null)?.userLocation;
        if (passedLocation) {
          const distanceKm = calculateDistance(passedLocation, {
            latitude: pharmacyData.latitude,
            longitude: pharmacyData.longitude
          });

          console.log('User Location', passedLocation.latitude, passedLocation.longitude);
          console.log('Pharmacy Location', pharmacyData.latitude, pharmacyData.longitude);
          console.log('Distance', Number(distanceKm.toFixed(1)));
          console.log('ETA', estimateDeliveryTime(distanceKm));

          setUserLocation(passedLocation);
          setDistance(Number(distanceKm.toFixed(1)));
          setEtaMinutes(estimateDeliveryTime(distanceKm));
          setLoading(false);
          return;
        }

        const browserLocation = await new Promise<Coordinates | null>((resolve) => {
          if (!navigator.geolocation) {
            resolve(null);
            return;
          }

          navigator.geolocation.getCurrentPosition(
            (position) => {
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: position.timestamp
              });
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
          );
        });

        if (!browserLocation) {
          setUserLocation(null);
          setDistance(null);
          setEtaMinutes(null);
          setLoading(false);
          return;
        }

        console.log('User Location', browserLocation.latitude, browserLocation.longitude);
        console.log('Pharmacy Location', pharmacyData.latitude, pharmacyData.longitude);

        const distanceKm = calculateDistance(browserLocation, {
          latitude: pharmacyData.latitude,
          longitude: pharmacyData.longitude
        });
        const routeEta = estimateDeliveryTime(distanceKm);

        console.log('Distance', Number(distanceKm.toFixed(1)));
        console.log('ETA', routeEta);

        setUserLocation(browserLocation);
        setDistance(Number(distanceKm.toFixed(1)));
        setEtaMinutes(routeEta);
      } catch (err: any) {
        setError(err?.message || 'Failed to load pharmacy details');
      } finally {
        setLoading(false);
      }
    };

    void loadPharmacyData();
  }, [pharmacyId, locationState.state]);

  const openGoogleMaps = () => {
    if (!pharmacy) return;

    const originParam = userLocation
      ? `&origin=${userLocation.latitude},${userLocation.longitude}`
      : '';

    const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${pharmacy.latitude},${pharmacy.longitude}${originParam}`;
    window.open(routeUrl, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-slate-200 bg-white/80 p-8 text-center shadow-[0_30px_80px_rgba(15,23,42,0.08)]">
          <div className="text-slate-600">Loading pharmacy details...</div>
        </div>
      </main>
    );
  }

  if (error || !pharmacy) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-red-200 bg-red-50 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)]">
          <div className="text-red-700 font-semibold mb-4">{error || 'Pharmacy not found'}</div>
          <button
            type="button"
            onClick={() => navigate('/search')}
            className="secondary-button flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Search
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header with back button */}
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/search')}
          className="secondary-button flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h1 className="text-3xl font-black text-slate-900">{pharmacy.name}</h1>
        <div className="w-[120px]" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left side: Map */}
        <div className="lg:col-span-2">
          <div className="rounded-[32px] border border-slate-200 bg-white/80 shadow-[0_30px_80px_rgba(15,23,42,0.08)] overflow-hidden">
            {userLocation && pharmacy ? (
              <MapView
                points={[
                  {
                    lat: userLocation.latitude,
                    lng: userLocation.longitude,
                    label: 'Your Location'
                  },
                  {
                    lat: pharmacy.latitude,
                    lng: pharmacy.longitude,
                    label: pharmacy.name
                  }
                ]}
                center={[pharmacy.latitude, pharmacy.longitude]}
              />
            ) : (
              <div className="h-[400px] flex items-center justify-center bg-slate-50 text-slate-600">
                <div className="text-center">
                  <MapPin className="h-12 w-12 text-slate-300 mx-auto mb-2" />
                  <p>Unable to determine your location</p>
                  <p className="text-sm text-slate-500 mt-1">Permission may have been denied</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right side: Details */}
        <div className="space-y-4">
          {/* Distance and ETA */}
          {distance !== null && etaMinutes !== null && (
            <div className="rounded-[28px] border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center gap-2 text-blue-700 font-semibold mb-3">
                <Navigation className="h-5 w-5" />
                Route Information
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.1em] text-blue-600">Distance</div>
                  <div className="text-2xl font-black text-slate-900">{distance.toFixed(1)} km</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.1em] text-blue-600">Estimated Time</div>
                  <div className="text-2xl font-black text-slate-900">{etaMinutes} min</div>
                </div>
              </div>
            </div>
          )}

          {/* Pharmacy Address */}
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs uppercase tracking-[0.1em] text-slate-500 mb-1">Address</div>
                <div className="font-semibold text-slate-900">{pharmacy.address}</div>
              </div>
            </div>
          </div>

          {/* Phone */}
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs uppercase tracking-[0.1em] text-slate-500 mb-1">Phone</div>
                <a
                  href={`tel:${pharmacy.phone}`}
                  className="font-semibold text-blue-600 hover:text-blue-700 break-all"
                >
                  {pharmacy.phone}
                </a>
              </div>
            </div>
          </div>

          {/* Hours */}
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-xs uppercase tracking-[0.1em] text-slate-500 mb-1">Hours</div>
                <div className="font-semibold text-slate-900">
                  {pharmacy.opensAt} – {pharmacy.closesAt}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.1em] text-slate-500 mb-2">Coordinates</div>
              <div className="font-semibold text-slate-900">
                {pharmacy.latitude.toFixed(6)}, {pharmacy.longitude.toFixed(6)}
              </div>
            </div>

            <a
              href={`tel:${pharmacy.phone}`}
              className="primary-button w-full justify-center flex items-center gap-2"
            >
              <Phone className="h-4 w-4" />
              Call Pharmacy
            </a>
            <button
              type="button"
              onClick={openGoogleMaps}
              className="secondary-button w-full justify-center flex items-center gap-2"
            >
              <Navigation className="h-4 w-4" />
              Open Navigation
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
