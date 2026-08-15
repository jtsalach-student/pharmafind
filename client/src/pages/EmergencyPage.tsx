import { motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, ArrowRight, MapPin, Phone, ShieldAlert, TimerReset } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDeviceLocation, type Coordinates } from '../lib/geolocation';
import { fetchRoadRoute } from '../lib/routing';
import { getSupabaseClient } from '../lib/supabase';
import { isPharmacyOpen } from '../lib/data';

type EmergencyDrug = {
  id: string;
  genericName: string;
  brandName: string;
  category: string;
  isEmergency: boolean;
  price?: number | string;
  Inventory?: { price: number | null, isAvailable: boolean, isActive: boolean }[];
};

type EmergencyResult = {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  etaMinutes: number;
  stock: number;
  price: number;
  isOpen: boolean;
  opensAt?: string;
  closesAt?: string;
};

export function EmergencyPage() {
  const navigate = useNavigate();
  const [drugs, setDrugs] = useState<EmergencyDrug[]>([]);
  const [selectedDrug, setSelectedDrug] = useState<EmergencyDrug | null>(null);
  const [results, setResults] = useState<EmergencyResult[]>([]);
  const [search, setSearch] = useState('');
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [manualLocation, setManualLocation] = useState({ latitude: '', longitude: '' });
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const [loadingDrugs, setLoadingDrugs] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const client = getSupabaseClient();
        const { data, error } = await client
          .from('Drug')
          .select('*, Inventory(price, isAvailable, isActive)')
          .eq('isEmergency', true)
          .order('genericName', { ascending: true });

        if (error) throw error;
        setDrugs((data ?? []) as EmergencyDrug[]);
        if ((data ?? []).length > 0) {
          setSelectedDrug((data ?? [])[0] as EmergencyDrug);
        }
      } catch (error: any) {
        setLookupError(error?.message || 'Unable to load emergency drugs from the database.');
      } finally {
        setLoadingDrugs(false);
      }
    };

    const getLocation = async () => {
      const coords = await getDeviceLocation();
      if (!coords) {
        setLocationWarning('Location access was denied. Please enter your coordinates manually to find the nearest pharmacy.');
        return;
      }

      console.log('User Location', coords.latitude, coords.longitude);
      setUserLocation(coords);
      setManualLocation({
        latitude: String(coords.latitude),
        longitude: String(coords.longitude)
      });
    };

    void loadData();
    void getLocation();
  }, []);

  const filteredDrugs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drugs;
    return drugs.filter((drug) => `${drug.genericName} ${drug.brandName}`.toLowerCase().includes(q));
  }, [drugs, search]);

  const resolveLocation = (): Coordinates | null => {
    if (userLocation) return userLocation;

    const latitude = Number(manualLocation.latitude);
    const longitude = Number(manualLocation.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    return { latitude, longitude };
  };

  const handleDrugSearch = async (drug: EmergencyDrug) => {
    setSelectedDrug(drug);
    setLookupError(null);
    setLoadingResults(true);

    try {
      const currentLocation = resolveLocation();
      if (!currentLocation) {
        setLookupError('Please allow browser geolocation or enter a valid latitude and longitude first.');
        setLoadingResults(false);
        return;
      }

      const client = getSupabaseClient();
      const { data: inventoryData, error: inventoryError } = await client
        .from('Inventory')
        .select('id, quantity, price, expiryDate, pharmacyId, drugId, isActive, isAvailable')
        .eq('drugId', drug.id)
        .eq('isActive', true)
        .eq('isAvailable', true)
        .gt('quantity', 0);

      if (inventoryError) throw inventoryError;

      // Filter out expired items
      const nowUtc = new Date();
      const todayAccra = new Date(nowUtc.toLocaleString('en-US', { timeZone: 'Africa/Accra' }));
      todayAccra.setHours(0, 0, 0, 0);
      const validInventory = (inventoryData ?? []).filter((item) => {
        if (!item.expiryDate) return true;
        const exp = new Date(item.expiryDate);
        exp.setHours(0, 0, 0, 0);
        return exp >= todayAccra;
      });

      if (!validInventory || validInventory.length === 0) {
        setResults([]);
        setLookupError(`No pharmacies currently have unexpired ${drug.genericName} in stock.`);
        setLoadingResults(false);
        return;
      }

      const pharmacyIds = [...new Set(validInventory.map((item) => item.pharmacyId))];
      const { data: pharmacies, error: pharmacyError } = await client
        .from('Pharmacy')
        .select('id, name, address, phone, latitude, longitude, opensAt, closesAt')
        .in('id', pharmacyIds);

      if (pharmacyError) throw pharmacyError;

      const pharmacyMap = new Map((pharmacies ?? []).map((pharmacy) => [pharmacy.id, pharmacy]));

      const matchingPharmacies = await Promise.all(
        validInventory.map(async (entry): Promise<EmergencyResult | null> => {
          const pharmacy = pharmacyMap.get(entry.pharmacyId);
          if (!pharmacy || pharmacy.latitude == null || pharmacy.longitude == null) {
            return null;
          }

          const roadRoute = await fetchRoadRoute(
            [pharmacy.latitude, pharmacy.longitude],
            [currentLocation.latitude, currentLocation.longitude]
          );

          const numericPrice = Number(entry.price ?? drug.price ?? 0);
          const open = isPharmacyOpen((pharmacy as any).opensAt, (pharmacy as any).closesAt);

          return {
            id: pharmacy.id,
            name: pharmacy.name,
            address: pharmacy.address ?? 'Address unavailable',
            phone: pharmacy.phone || 'No phone listed',
            latitude: pharmacy.latitude,
            longitude: pharmacy.longitude,
            distanceKm: roadRoute.distanceKm,
            etaMinutes: roadRoute.etaMinutes,
            stock: Number(entry.quantity ?? 0),
            price: numericPrice,
            isOpen: open,
            opensAt: (pharmacy as any).opensAt ?? undefined,
            closesAt: (pharmacy as any).closesAt ?? undefined
          };
        })
      );

      // Open first → then nearest by road distance
      const sortedPharmacies = matchingPharmacies
        .filter((item): item is EmergencyResult => Boolean(item))
        .sort((a, b) => {
          if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
          return a.distanceKm - b.distanceKm;
        });

      setResults(sortedPharmacies);
      if (sortedPharmacies.length === 0) {
        setLookupError(`No pharmacies currently have ${drug.genericName} in stock.`);
      }
    } catch (error: any) {
      setLookupError(error?.message || 'Unable to find nearby emergency stock.');
      setResults([]);
    } finally {
      setLoadingResults(false);
    }
  };

  useEffect(() => {
    if (selectedDrug) {
      void handleDrugSearch(selectedDrug);
    }
  }, [selectedDrug]);

  const nearestResult = results[0] ?? null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      <div className="overflow-hidden rounded-[32px] border border-red-200 bg-gradient-to-br from-red-600 via-red-500 to-orange-500 p-6 text-white shadow-[0_30px_80px_rgba(239,68,68,0.28)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-red-50">
              <AlertTriangle className="h-3.5 w-3.5" />
              Emergency mode
            </div>
            <h1 className="mt-4 max-w-xl text-4xl font-black tracking-tight sm:text-5xl">Find emergency medication now</h1>
          </div>

          <div className="rounded-[24px] border border-white/20 bg-white/10 p-4 backdrop-blur-md">
            <div className="text-xs uppercase tracking-[0.2em] text-red-100">Current location</div>
            <div className="mt-2 text-lg font-black">
              {userLocation ? `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}` : 'Manual entry'}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_180px]">
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-red-200" />
            <input
              aria-label="Emergency medicine search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 pl-11 text-white placeholder:text-red-100 outline-none ring-0"
              placeholder="Search emergency medicine..."
            />
          </div>
          <button type="button" onClick={() => selectedDrug && void handleDrugSearch(selectedDrug)} className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-red-600 shadow-lg">
            Search nearby
          </button>
        </div>

        {(locationWarning || !userLocation) && (
          <div className="mt-5 rounded-2xl border border-white/20 bg-white/10 p-4 text-sm text-red-50">
            {locationWarning || 'Location access is unavailable. Please enter your coordinates below.'}
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-red-50">
            <span className="mb-1 block">Latitude</span>
            <input
              value={manualLocation.latitude}
              onChange={(event) => setManualLocation((current) => ({ ...current, latitude: event.target.value }))}
              className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white placeholder:text-red-100 outline-none"
              placeholder="5.6123"
            />
          </label>
          <label className="block text-sm text-red-50">
            <span className="mb-1 block">Longitude</span>
            <input
              value={manualLocation.longitude}
              onChange={(event) => setManualLocation((current) => ({ ...current, longitude: event.target.value }))}
              className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white placeholder:text-red-100 outline-none"
              placeholder="-0.2001"
            />
          </label>
        </div>
      </div>

      {lookupError && (
        <div className="mt-6 rounded-[28px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {lookupError}
        </div>
      )}

      <div className="mt-8 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          {loadingDrugs ? (
            <div className="rounded-[28px] border border-red-100 bg-white p-6 text-slate-600">Loading emergency drugs...</div>
          ) : filteredDrugs.length === 0 ? (
            <div className="rounded-[28px] border border-red-100 bg-white p-6 text-slate-600">No emergency drugs available in the database.</div>
          ) : (
            filteredDrugs.map((drug) => (
              <motion.button
                key={drug.id}
                type="button"
                onClick={() => setSelectedDrug(drug)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`w-full rounded-[28px] border p-5 text-left shadow-[0_20px_60px_rgba(15,23,42,0.06)] transition ${selectedDrug?.id === drug.id ? 'border-red-200 bg-red-50' : 'border-red-100 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-red-500">Emergency drug</div>
                    <h2 className="mt-2 text-2xl font-black text-slate-900">{drug.genericName}</h2>
                  </div>
                  <div className="rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-600">{drug.brandName}</div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-red-100 bg-white px-3 py-2 text-sm font-medium text-slate-600">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-red-600" /> 
                    Price:{' '}
                    {(() => {
                      const basePrice = Number(drug.price ?? 0);
                      const invPrices = (drug.Inventory ?? [])
                        .filter((i) => i.isAvailable && i.isActive)
                        .map((i) => Number(i.price ?? basePrice))
                        .filter((p) => p > 0);

                      if (invPrices.length > 0) {
                        const min = Math.min(...invPrices);
                        const max = Math.max(...invPrices);
                        if (min === max) {
                          return `GHS ${min.toFixed(2)}`;
                        }
                        return `GHS ${min.toFixed(2)} - ${max.toFixed(2)}`;
                      }
                      return `GHS ${basePrice.toFixed(2)}`;
                    })()}
                  </div>
                  <ArrowRight className="h-4 w-4 text-red-600" />
                </div>
              </motion.button>
            ))
          )}
        </div>

        <div className="rounded-[30px] border border-red-100 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-2 text-red-600">
            <TimerReset className="h-5 w-5" />
            <h3 className="text-lg font-black text-slate-900">Nearest available pharmacy</h3>
          </div>

          {loadingResults ? (
            <div className="mt-6 rounded-2xl bg-slate-50 p-6 text-slate-600">Searching inventory and calculating ETA...</div>
          ) : nearestResult ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-[24px] border border-red-100 bg-red-50 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-red-500">Selected medication</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{selectedDrug?.genericName}</div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Name</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{nearestResult.name}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Address</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{nearestResult.address}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
                  <div className={`mt-1 text-lg font-black ${
                    nearestResult.isOpen ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    {nearestResult.isOpen ? 'OPEN NOW' : 'CLOSED'}
                  </div>
                  {nearestResult.opensAt && nearestResult.closesAt && (
                    <div className="mt-0.5 text-xs text-slate-500">
                      Hours: {nearestResult.opensAt} – {nearestResult.closesAt}
                    </div>
                  )}
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Phone</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{nearestResult.phone}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Distance</div>
                    <div className="mt-1 text-lg font-black text-slate-900">{nearestResult.distanceKm.toFixed(1)} km</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">ETA</div>
                    <div className="mt-1 text-lg font-black text-slate-900">{nearestResult.etaMinutes} min</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Price</div>
                  <div className="mt-1 text-lg font-black text-emerald-700">GHS {nearestResult.price.toFixed(2)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Available stock</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{nearestResult.stock} units</div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <a href={`tel:${nearestResult.phone}`} className="primary-button flex-1 justify-center">
                  <Phone className="mr-2 h-4 w-4" />
                  Call Pharmacy
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const pharmacyState = {
                      id: nearestResult.id,
                      name: nearestResult.name,
                      address: nearestResult.address,
                      phone: nearestResult.phone,
                      latitude: nearestResult.latitude,
                      longitude: nearestResult.longitude
                    };

                    navigate(`/pharmacy/${nearestResult.id}`, {
                      state: {
                        pharmacy: pharmacyState,
                        userLocation: userLocation ?? resolveLocation()
                      }
                    });
                  }}
                  className="secondary-button flex-1 justify-center"
                >
                  Get Directions
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl bg-slate-50 p-6 text-slate-600">
              Select a medicine to find the nearest pharmacy with stock.
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-[28px] border border-red-100 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-2 text-red-600">
          <TimerReset className="h-5 w-5" />
          <h3 className="text-lg font-black text-slate-900">Critical response guidance</h3>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This system prioritizes the nearest open pharmacy with available emergency stock. For severe reactions or life-threatening symptoms, call emergency services immediately while PharmaFind routes medication supply.
        </p>
      </div>
    </main>
  );
}

