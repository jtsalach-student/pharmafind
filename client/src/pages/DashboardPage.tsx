import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Clock3, HeartPulse, Loader2, MapPin, Navigation, Search, ShieldAlert, Stethoscope, Truck, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser } from '../lib/auth';
import { getDashboardData, isPharmacyOpen, type DashboardStats } from '../lib/data';
import { getDeviceLocation, type Coordinates } from '../lib/geolocation';
import { fetchRoadRoute } from '../lib/routing';
import { getSupabaseClient } from '../lib/supabase';

type RoleKey = 'USER' | 'PHARMACIST' | 'PHARMACY_ADMIN' | 'DRIVER' | 'SYSTEM_ADMIN';

type RoleMeta = {
  label: string;
  accent: string;
  icon: typeof HeartPulse;
};

type DrugRecord = {
  id: string;
  genericName: string;
  brandName: string;
  category?: string;
  price?: number | string;
  minPrice?: number;
  maxPrice?: number;
  isEmergency?: boolean;
  requiresRx?: boolean;
};

type NearbyPharmacy = {
  pharmacyId: string;
  pharmacyName: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  etaMinutes: number;
  quantity: number;
  price?: number;
  pharmacyIsOpen: boolean;
  pharmacyOpensAt?: string;
  pharmacyClosesAt?: string;
};

type DeliverySummary = {
  id: string;
  status: string;
  createdAt: string;
  pharmacyName: string;
  etaMinutes: number;
  distanceKm: number;
};

const roleMeta: Record<RoleKey, RoleMeta> = {
  USER: {
    label: 'User Dashboard',
    accent: 'from-sky-500 to-emerald-500',
    icon: HeartPulse
  },
  PHARMACIST: {
    label: 'Pharmacist Dashboard',
    accent: 'from-violet-500 to-sky-500',
    icon: Stethoscope
  },
  PHARMACY_ADMIN: {
    label: 'Pharmacy Admin Dashboard',
    accent: 'from-emerald-500 to-sky-500',
    icon: ShieldAlert
  },
  DRIVER: {
    label: 'Delivery Dashboard',
    accent: 'from-amber-500 to-orange-500',
    icon: Truck
  },
  SYSTEM_ADMIN: {
    label: 'Admin Dashboard',
    accent: 'from-emerald-500 to-sky-500',
    icon: Users
  }
};

const RECENT_SEARCH_KEY = 'pharmafind_recent_drug_searches';

export function DashboardPage() {
  const navigate = useNavigate();
  const user = getUser();
  const role = (user?.role ?? 'USER') as RoleKey;
  const meta = roleMeta[role];
  const Icon = meta.icon;

  const [stats, setStats] = useState<DashboardStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [genericName, setGenericName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [drugResults, setDrugResults] = useState<DrugRecord[]>([]);
  const [selectedDrugId, setSelectedDrugId] = useState<string | null>(null);
  const [nearbyPharmacies, setNearbyPharmacies] = useState<NearbyPharmacy[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [emergencyDrugs, setEmergencyDrugs] = useState<DrugRecord[]>([]);
  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);

  useEffect(() => {
    if (role === 'SYSTEM_ADMIN' || role === 'PHARMACY_ADMIN') {
      navigate('/admin', { replace: true });
      return;
    }
    if (role === 'PHARMACIST') {
      navigate('/pharmacist', { replace: true });
      return;
    }
    if (role === 'DRIVER') {
      navigate('/driver', { replace: true });
      return;
    }
  }, [role, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getDashboardData(role);
        setStats(data.stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    if (role !== 'USER') {
      void fetchData();
      return;
    }

    const loadUserData = async () => {
      try {
        setLoading(true);
        const client = getSupabaseClient();

        const [location, emergencyData] = await Promise.all([
          getDeviceLocation(15000),
          client.from('Drug').select('id, genericName, brandName, category, isEmergency, price').eq('isEmergency', true).order('genericName', { ascending: true }).limit(5)
        ]);

        setUserLocation(location ?? null);
        if (location) {
          localStorage.setItem('pharmafind_user_location', JSON.stringify(location));
        }

        if (emergencyData.error) {
          throw emergencyData.error;
        }

        setEmergencyDrugs((emergencyData.data ?? []) as DrugRecord[]);

        const storedSearches = localStorage.getItem(RECENT_SEARCH_KEY);
        if (storedSearches) {
          try {
            setRecentSearches(JSON.parse(storedSearches));
          } catch {
            setRecentSearches([]);
          }
        }

        const { data: authData, error: authError } = await client.auth.getUser();
        if (!authError && authData.user) {
          const { data: rows, error: rowsError } = await client
            .from('DeliveryRequest')
            .select('*')
            .eq('userId', authData.user.id)
            .order('requestedAt', { ascending: false })
            .limit(5);

          if (rowsError) {
            throw rowsError;
          }

          setDeliveries((rows ?? []).map((item) => ({
            id: item.id,
            status: item.status,
            createdAt: item.requestedAt ?? item.updatedAt ?? new Date().toISOString(),
            pharmacyName: 'Pharmacy route',
            etaMinutes: 0,
            distanceKm: 0
          })));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load user dashboard data');
      } finally {
        setLoading(false);
      }
    };

    void loadUserData();
  }, [role]);

  const persistRecentSearches = (value: string) => {
    const existing = recentSearches.filter((item) => item.toLowerCase() !== value.toLowerCase());
    const next = [value, ...existing].slice(0, 6);
    setRecentSearches(next);
    localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
  };

  const findNearestPharmacies = async (drugId: string) => {
    if (!userLocation) {
      setSearchMessage('Enable browser geolocation to find the nearest pharmacy with stock.');
      setNearbyPharmacies([]);
      return;
    }

    try {
      const client = getSupabaseClient();
      const { data: inventoryData, error: inventoryError } = await client
        .from('Inventory')
        .select('id, quantity, price, pharmacyId, drugId, isAvailable, isActive')
        .eq('drugId', drugId)
        .eq('isAvailable', true)
        .eq('isActive', true)
        .gt('quantity', 0);

      if (inventoryError) {
        throw inventoryError;
      }

      if (!inventoryData || inventoryData.length === 0) {
        setNearbyPharmacies([]);
        setSearchMessage('No pharmacies currently have this drug in stock.');
        return;
      }

      const pharmacyIds = [...new Set(inventoryData.map((item) => item.pharmacyId))];
      const { data: pharmacyRows, error: pharmacyError } = await client
        .from('Pharmacy')
        .select('id, name, address, phone, latitude, longitude, opensAt, closesAt')
        .in('id', pharmacyIds);

      if (pharmacyError) {
        throw pharmacyError;
      }

      const pharmacyMap = new Map((pharmacyRows ?? []).map((pharmacy) => [pharmacy.id, pharmacy]));
      const matches = await Promise.all(
        (inventoryData ?? []).map(async (entry): Promise<NearbyPharmacy | null> => {
          const pharmacy = pharmacyMap.get(entry.pharmacyId);
          if (!pharmacy || pharmacy.latitude == null || pharmacy.longitude == null) {
            return null;
          }

          const roadRoute = await fetchRoadRoute(
            [pharmacy.latitude, pharmacy.longitude],
            [userLocation.latitude, userLocation.longitude]
          );

          const numericPrice = Number(entry.price ?? 0);

          return {
            pharmacyId: pharmacy.id,
            pharmacyName: pharmacy.name,
            address: pharmacy.address ?? 'Address unavailable',
            phone: pharmacy.phone || 'No phone listed',
            latitude: pharmacy.latitude,
            longitude: pharmacy.longitude,
            distanceKm: roadRoute.distanceKm,
            etaMinutes: roadRoute.etaMinutes,
            quantity: Number(entry.quantity ?? 0),
            price: Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : undefined,
            pharmacyIsOpen: isPharmacyOpen((pharmacy as any).opensAt, (pharmacy as any).closesAt),
            pharmacyOpensAt: (pharmacy as any).opensAt ?? undefined,
            pharmacyClosesAt: (pharmacy as any).closesAt ?? undefined
          };
        })
      );

      // Open first, then by shortest road network distance
      const sortedMatches = matches
        .filter((item): item is NearbyPharmacy => Boolean(item))
        .sort((a, b) => {
          if (a.pharmacyIsOpen !== b.pharmacyIsOpen) return a.pharmacyIsOpen ? -1 : 1;
          return a.distanceKm - b.distanceKm;
        });

      setNearbyPharmacies(sortedMatches);
      if (sortedMatches.length === 0) {
        setSearchMessage('No pharmacies near your location currently have this drug in stock.');
      }
    } catch (err) {
      setSearchMessage(err instanceof Error ? err.message : 'Failed to look up nearby pharmacies.');
      setNearbyPharmacies([]);
    }
  };

  const handleDrugSearch = async () => {
    const normalizedGeneric = genericName.trim();
    const normalizedBrand = brandName.trim();

    if (!normalizedGeneric && !normalizedBrand) {
      setDrugResults([]);
      setNearbyPharmacies([]);
      setSearchMessage('Enter a drug name or brand to search the catalogue.');
      return;
    }

    try {
      setSearchMessage(null);
      const client = getSupabaseClient();
      const conditions = [
        normalizedGeneric ? `genericName.ilike.%${normalizedGeneric}%` : null,
        normalizedBrand ? `brandName.ilike.%${normalizedBrand}%` : null
      ].filter(Boolean).join(',');

      const { data: rows, error } = await client
        .from('Drug')
        .select('id, genericName, brandName, category, isEmergency, requiresRx, price')
        .or(conditions)
        .order('genericName', { ascending: true })
        .limit(20);

      if (error) {
        throw error;
      }

      const rawResults = (rows ?? []) as DrugRecord[];
      
      // Enrich with Inventory price range (MIN - MAX) across active/available inventory
      const drugIds = rawResults.map((d) => d.id);
      const { data: invRows } = drugIds.length > 0
        ? await client
            .from('Inventory')
            .select('drugId, price')
            .in('drugId', drugIds)
            .eq('isActive', true)
            .eq('isAvailable', true)
            .gt('quantity', 0)
        : { data: [] as any[] };

      const priceMap = new Map<string, number[]>();
      (invRows ?? []).forEach((item) => {
        const p = Number(item.price);
        if (Number.isFinite(p) && p > 0) {
          if (!priceMap.has(item.drugId)) priceMap.set(item.drugId, []);
          priceMap.get(item.drugId)!.push(p);
        }
      });

      const nextResults = rawResults.map((drug) => {
        const prices = priceMap.get(drug.id);
        if (prices && prices.length > 0) {
          return {
            ...drug,
            minPrice: Math.min(...prices),
            maxPrice: Math.max(...prices)
          };
        }
        const fallback = Number(drug.price ?? 0);
        return {
          ...drug,
          minPrice: fallback > 0 ? fallback : undefined,
          maxPrice: fallback > 0 ? fallback : undefined
        };
      });

      setDrugResults(nextResults);

      const searchLabel = [normalizedGeneric, normalizedBrand].filter(Boolean).join(' / ');
      persistRecentSearches(searchLabel);

      if (nextResults.length === 0) {
        setSearchMessage('No drugs matched your search.');
        setNearbyPharmacies([]);
        setSelectedDrugId(null);
        return;
      }

      const chosenDrug = nextResults[0];
      setSelectedDrugId(chosenDrug.id);
      await findNearestPharmacies(chosenDrug.id);
    } catch (err) {
      setSearchMessage(err instanceof Error ? err.message : 'Unable to search the drug catalogue.');
      setDrugResults([]);
      setNearbyPharmacies([]);
    }
  };

  const handleDirections = (pharmacy: NearbyPharmacy) => {
    navigate(`/route/${pharmacy.pharmacyId}`, {
      state: {
        pharmacy: {
          id: pharmacy.pharmacyId,
          name: pharmacy.pharmacyName,
          address: pharmacy.address,
          phone: pharmacy.phone,
          latitude: pharmacy.latitude,
          longitude: pharmacy.longitude
        },
        userLocation
      }
    });
  };

  const handleRequestDelivery = async (pharmacy: NearbyPharmacy) => {
    const drugForOrder = drugResults.find((drug) => drug.id === selectedDrugId) ?? null;

    if (!drugForOrder) {
      setDeliveryMessage('No drug selected for this order.');
      return;
    }

    const unitPrice = Number(pharmacy.price ?? drugForOrder.price ?? 0);

    // For prescription drugs, navigate to upload page
    if (drugForOrder.requiresRx) {
      navigate('/prescriptions/upload', {
        state: {
          pharmacy,
          drugId: drugForOrder.id,
          drugName: drugForOrder.genericName,
          pharmacyId: pharmacy.pharmacyId,
          pharmacyName: pharmacy.pharmacyName,
          quantity: 1,
          unitPrice,
          distanceKm: pharmacy.distanceKm,
          requiresRx: true
        }
      });
      return;
    }

    // For non-prescription drugs, go directly to payment
    // We'll create a non-Rx prescription in APPROVED status on the payment page
    try {
      setDeliveryMessage(null);
      if (!userLocation) {
        setDeliveryMessage('Enable location services before requesting a delivery.');
        return;
      }

      navigate('/payment', {
        state: {
          drugId: drugForOrder.id,
          drugName: drugForOrder.genericName,
          pharmacyId: pharmacy.pharmacyId,
          pharmacyName: pharmacy.pharmacyName,
          quantity: 1,
          unitPrice,
          distanceKm: pharmacy.distanceKm,
          requiresRx: false
        }
      });
    } catch (err) {
      setDeliveryMessage(err instanceof Error ? err.message : 'Unable to proceed with payment.');
    }
  };

  if (role !== 'USER') {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Dashboard</div>
              <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-tight text-slate-900">
                <Icon className="h-8 w-8" />
                {meta.label}
              </h1>
              <p className="mt-2 text-sm text-slate-600">Welcome back, {user?.name ?? 'User'}. Here's your overview.</p>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-6 flex gap-3 rounded-[28px] border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-900">Error loading data</h3>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="mt-6 flex items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 p-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {stats.map((stat) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[24px] border border-slate-200 bg-slate-50 p-6"
              >
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{stat.label}</div>
                <div className="mt-3 text-3xl font-black text-slate-900">{stat.value}</div>
                <div className="mt-2 text-xs font-medium text-slate-500">{stat.detail}</div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Dashboard</div>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-tight text-slate-900">
              <Icon className="h-8 w-8" />
              {meta.label}
            </h1>
            <p className="mt-2 text-sm text-slate-600">Welcome back, {user?.name ?? 'User'}. Your medicine and delivery centre is ready.</p>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700">
            <MapPin className="h-4 w-4" />
            {userLocation ? `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}` : 'Location unavailable'}
          </div>
        </div>
      </section>

      {error && (
        <div className="mt-6 flex gap-3 rounded-[28px] border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Error loading dashboard</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 p-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="rounded-[32px] border border-slate-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-sky-100 p-2 text-sky-700"><Search className="h-5 w-5" /></div>
              <h2 className="text-2xl font-black text-slate-900">Drug Search</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Drug generic name
                <input
                  value={genericName}
                  onChange={(event) => setGenericName(event.target.value)}
                  className="mt-2 input-shell"
                  placeholder="e.g. paracetamol"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Drug brand name
                <input
                  value={brandName}
                  onChange={(event) => setBrandName(event.target.value)}
                  className="mt-2 input-shell"
                  placeholder="e.g. Panadol"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => void handleDrugSearch()} className="primary-button">
                Search drugs
              </button>
              <button type="button" onClick={() => { setGenericName(''); setBrandName(''); setDrugResults([]); setNearbyPharmacies([]); setSelectedDrugId(null); setSearchMessage(null); }} className="secondary-button">
                Clear
              </button>
            </div>

            {searchMessage && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{searchMessage}</div>
            )}

            {drugResults.length > 0 && (
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {drugResults.map((drug) => (
                  <button
                    key={drug.id}
                    type="button"
                    onClick={async () => {
                      setSelectedDrugId(drug.id);
                      await findNearestPharmacies(drug.id);
                    }}
                    className={`rounded-[22px] border p-4 text-left transition ${selectedDrugId === drug.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                  >
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Drug</div>
                    <div className="mt-2 text-lg font-black text-slate-900">{drug.genericName}</div>
                    <div className="mt-3 text-sm font-bold text-emerald-700">
                      {drug.minPrice != null && drug.maxPrice != null
                        ? (drug.minPrice === drug.maxPrice
                            ? `GH₵ ${drug.minPrice.toFixed(2)}`
                            : `GH₵ ${drug.minPrice.toFixed(2)} - ${drug.maxPrice.toFixed(2)}`)
                        : `GH₵ ${Number(drug.price ?? 0).toFixed(2)}`}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-[32px] border border-slate-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-100 p-2 text-emerald-700"><MapPin className="h-5 w-5" /></div>
                <h2 className="text-2xl font-black text-slate-900">Nearest Pharmacies</h2>
              </div>

              {nearbyPharmacies.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
                  Search for a drug to view nearby pharmacies with stock.
                </div>
              ) : (
                <div className="space-y-4">
                  {nearbyPharmacies.map((pharmacy) => (
                    <div key={pharmacy.pharmacyId} className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-sky-600">Pharmacy</div>
                          <div className="mt-2 text-xl font-black text-slate-900">{pharmacy.pharmacyName}</div>
                          <div className="mt-1 flex items-start gap-2 text-sm text-slate-600">
                            <MapPin className="mt-0.5 h-4 w-4 text-slate-500" />
                            <span>{pharmacy.address}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                            pharmacy.pharmacyIsOpen
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-600'
                          }`}>
                            {pharmacy.pharmacyIsOpen ? 'OPEN NOW' : 'CLOSED'}
                          </span>
                          {pharmacy.pharmacyOpensAt && pharmacy.pharmacyClosesAt && (
                            <span className="text-[11px] text-slate-500">
                              {pharmacy.pharmacyOpensAt} – {pharmacy.pharmacyClosesAt}
                            </span>
                          )}
                          <div className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                            {pharmacy.quantity} in stock
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-4">
                        <div className="rounded-2xl bg-white p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Distance</div><div className="mt-1 text-lg font-black text-slate-900">{pharmacy.distanceKm.toFixed(1)} km</div></div>
                        <div className="rounded-2xl bg-white p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">ETA</div><div className="mt-1 text-lg font-black text-slate-900">{pharmacy.etaMinutes} min</div></div>
                        <div className="rounded-2xl bg-white p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700">Price</div><div className="mt-1 text-lg font-black text-emerald-700">GH₵ {(pharmacy.price ?? Number(drugResults.find(d => d.id === selectedDrugId)?.price ?? 0)).toFixed(2)}</div></div>
                        <div className="rounded-2xl bg-white p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Phone</div><div className="mt-1 text-sm font-black text-slate-900">{pharmacy.phone}</div></div>
                      </div>

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          disabled={!pharmacy.pharmacyIsOpen}
                          onClick={() => handleDirections(pharmacy)}
                          title={pharmacy.pharmacyIsOpen ? undefined : 'This pharmacy is currently closed'}
                          className={`secondary-button flex-1 ${!pharmacy.pharmacyIsOpen ? 'cursor-not-allowed opacity-40' : ''}`}
                        >
                          <Navigation className="mr-2 h-4 w-4" />
                          Get Directions
                        </button>
                        <button
                          type="button"
                          disabled={!pharmacy.pharmacyIsOpen}
                          onClick={() => void handleRequestDelivery(pharmacy)}
                          title={pharmacy.pharmacyIsOpen ? undefined : 'This pharmacy is currently closed'}
                          className={`primary-button flex-1 ${!pharmacy.pharmacyIsOpen ? 'cursor-not-allowed opacity-40' : ''}`}
                        >
                          <Truck className="mr-2 h-4 w-4" />
                          Request Delivery
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="rounded-[32px] border border-slate-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-2xl bg-amber-100 p-2 text-amber-700"><Truck className="h-5 w-5" /></div>
                  <h2 className="text-2xl font-black text-slate-900">Current Deliveries</h2>
                </div>

                {deliveries.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                    No active delivery requests yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {deliveries.map((delivery) => (
                      <div key={delivery.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-bold text-slate-900">{delivery.pharmacyName}</div>
                          <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-700">{delivery.status}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Clock3 className="h-4 w-4" /> {delivery.etaMinutes} min ETA</div>
                        <div className="mt-1 text-sm text-slate-600">{delivery.distanceKm.toFixed(1)} km away</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-2xl bg-violet-100 p-2 text-violet-700"><Clock3 className="h-5 w-5" /></div>
                  <h2 className="text-2xl font-black text-slate-900">Recent Searches</h2>
                </div>

                {recentSearches.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                    Your recent searches will appear here.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((searchItem) => (
                      <button
                        key={searchItem}
                        type="button"
                        onClick={() => {
                          const [generic, brand] = searchItem.split(' / ');
                          setGenericName(generic ?? '');
                          setBrandName(brand ?? '');
                        }}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                      >
                        {searchItem}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-2xl bg-red-100 p-2 text-red-700"><HeartPulse className="h-5 w-5" /></div>
                  <h2 className="text-2xl font-black text-slate-900">Emergency Drugs</h2>
                </div>

                {emergencyDrugs.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                    No emergency drugs are currently flagged in the database.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {emergencyDrugs.map((drug) => (
                      <button
                        key={drug.id}
                        type="button"
                        onClick={async () => {
                          setGenericName(drug.genericName);
                          setBrandName(drug.brandName);
                          await handleDrugSearch();
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-[22px] border border-red-200 bg-red-50 p-3 text-left"
                      >
                        <div>
                          <div className="font-black text-slate-900">{drug.genericName}</div>
                          <div className="text-sm text-slate-600">{drug.brandName}</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-red-600" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {deliveryMessage && (
            <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {deliveryMessage}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
