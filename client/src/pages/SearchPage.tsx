import { AlertCircle, Clock3, Loader2, MapPin, Search, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapView } from '../components/MapView';
import { getDeviceLocation, type Coordinates } from '../lib/geolocation';
import { searchDrugAvailability, type DrugStockResult } from '../lib/data';

export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('Panadol');
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [results, setResults] = useState<DrugStockResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLocation = async () => {
      try {
        const coords = await getDeviceLocation();
        if (!coords) {
          setError('Could not access device location. Please enable location services.');
          return;
        }
        setLocation(coords);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to access device location');
      }
    };

    void loadLocation();
  }, []);

  const runDrugSearch = async (searchTerm: string) => {
    if (!location) {
      setError('Please enable location services before searching for nearby stock.');
      return;
    }

    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const matches = await searchDrugAvailability(location, trimmed);
      setResults(matches);

      if (matches.length === 0) {
        setError(`No nearby pharmacies currently have "${trimmed}" in stock.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search medicine stock');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (location && query.trim()) {
      void runDrugSearch(query);
    }
  }, [location]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 rounded-[30px] border border-slate-200 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Find medicine</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">Patient search</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to="/prescriptions/upload" className="secondary-button px-4 py-2 text-sm">
              <Clock3 className="mr-2 h-4 w-4" />
              Upload Prescription
            </Link>
            <Link to="/deliveries/track" className="primary-button px-4 py-2 text-sm">
              <Truck className="mr-2 h-4 w-4" />
              Track Delivery
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Search medicine"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drug name, e.g. Panadol"
              className="input-shell pl-11"
            />
          </div>
          <button
            type="button"
            className="primary-button w-full md:w-auto"
            onClick={() => void runDrugSearch(query)}
            disabled={loading || !location}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex gap-3 rounded-[28px] border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Search result</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 p-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-12 text-center">
          <p className="text-slate-600">No medicine matches found nearby.</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            {results.map((result) => (
              <div key={`${result.drugId}-${result.pharmacyId}`} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-sky-600">Medicine</div>
                    <h2 className="mt-2 text-xl font-black text-slate-900">{result.drugName}</h2>
                    <div className="mt-1 text-sm text-slate-600">{result.brandName}</div>
                  </div>
                  <div className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                    {result.stock} in stock
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Pharmacy</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{result.pharmacyName}</div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-sky-600" />
                    {result.address}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Distance</div>
                    <div className="mt-1 text-lg font-black text-slate-900">{result.distanceKm.toFixed(1)} km</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">ETA</div>
                    <div className="mt-1 text-lg font-black text-slate-900">{result.etaMinutes} min</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Phone</div>
                    <div className="mt-1 text-sm font-black text-slate-900">{result.phone}</div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700">Price</div>
                  <div className="mt-1 text-lg font-black text-emerald-700">GH₵ {Number(result.price ?? 0).toFixed(2)}</div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    className="secondary-button flex-1"
                    onClick={() => navigate(`/pharmacy/${result.pharmacyId}`, {
                      state: {
                        pharmacy: {
                          id: result.pharmacyId,
                          name: result.pharmacyName,
                          address: result.address,
                          phone: result.phone,
                          latitude: result.latitude,
                          longitude: result.longitude
                        },
                        userLocation: location
                      }
                    })}
                  >
                    View Details
                  </button>
                  <button
                    type="button"
                    className="primary-button flex-1"
                    onClick={() => navigate(`/pharmacy/${result.pharmacyId}`, {
                      state: {
                        pharmacy: {
                          id: result.pharmacyId,
                          name: result.pharmacyName,
                          address: result.address,
                          phone: result.phone,
                          latitude: result.latitude,
                          longitude: result.longitude
                        },
                        userLocation: location
                      }
                    })}
                  >
                    Get Directions
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            {location && (
              <div className="rounded-[28px] border border-slate-200 bg-white p-2 shadow-sm overflow-hidden">
                <div className="mb-2 flex items-center justify-between px-2 pt-2">
                  <div className="text-sm font-semibold text-slate-700">Nearest stock map</div>
                  <div className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">Live</div>
                </div>
                <MapView
                  points={results.map((item) => ({ lat: item.latitude, lng: item.longitude, label: item.pharmacyName }))}
                  center={[location.latitude, location.longitude]}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

