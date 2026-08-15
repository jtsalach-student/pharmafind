import { AlertCircle, ArrowLeft, Clock3, Loader2, MapPin, Search, ShoppingCart, Truck, Plus, Minus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapView } from '../components/MapView';
import { useCart } from '../contexts/CartContext';
import { getDeviceLocation, type Coordinates } from '../lib/geolocation';
import { searchDrugAvailability, type DrugStockResult } from '../lib/data';
import type { CartItem } from '../lib/cart';

export function SearchPage() {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [query, setQuery] = useState('Panadol');
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [results, setResults] = useState<DrugStockResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addToCartItem, setAddToCartItem] = useState<DrugStockResult | null>(null);
  const [cartQuantity, setCartQuantity] = useState(1);

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

  const handleAddToCart = (result: DrugStockResult) => {
    setAddToCartItem(result);
    setCartQuantity(1);
  };

  const confirmAddToCart = () => {
    if (!addToCartItem || !location) return;

    const selectedUnitPrice = Number(addToCartItem.inventoryPrice ?? addToCartItem.price ?? 0);
    const normalizedUnitPrice = Number.isFinite(selectedUnitPrice) && selectedUnitPrice > 0 ? selectedUnitPrice : 0;

    console.log('Inventory Price:', addToCartItem.inventoryPrice);
    console.log('Drug Price:', addToCartItem.price);
    console.log('Using Price:', normalizedUnitPrice);
    console.log('Stock:', addToCartItem.stock);
    console.log('Quantity to add:', cartQuantity);

    const cartItem: CartItem = {
      id: `${addToCartItem.drugId}-${addToCartItem.pharmacyId}`,
      drugId: addToCartItem.drugId,
      drugName: addToCartItem.drugName,
      brandName: addToCartItem.brandName,
      drugType: addToCartItem.drugType,
      strength: addToCartItem.strength,
      indication: addToCartItem.indication,
      category: addToCartItem.category,
      requiresRx: addToCartItem.requiresRx,
      isEmergency: addToCartItem.isEmergency,
      
      pharmacyId: addToCartItem.pharmacyId,
      pharmacyName: addToCartItem.pharmacyName,
      address: addToCartItem.address,
      phone: addToCartItem.phone,
      latitude: addToCartItem.latitude,
      longitude: addToCartItem.longitude,
      opensAt: undefined,
      closesAt: undefined,
      pharmacyIsOpen: addToCartItem.pharmacyIsOpen,
      
      unitPrice: normalizedUnitPrice,
      quantity: cartQuantity,
      availableQuantity: addToCartItem.stock,
      expiryDate: addToCartItem.expiryDate,
      batchNumber: addToCartItem.batchNumber,
      distanceKm: addToCartItem.distanceKm,
      etaMinutes: addToCartItem.etaMinutes,
      subtotal: Number((normalizedUnitPrice * cartQuantity).toFixed(2))
    };

    console.log('Cart Item:', cartItem);
    addToCart(cartItem);
    setAddToCartItem(null);
    setCartQuantity(1);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-600 hover:text-sky-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      <div className="mb-6 rounded-[30px] border border-slate-200 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Find medicine</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">User search</h1>
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
                    
                    {(result.drugType || result.strength) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {result.drugType && (
                          <span className="inline-block rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            {result.drugType}
                          </span>
                        )}
                        {result.strength && (
                          <span className="inline-block rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-700">
                            {result.strength}
                          </span>
                        )}
                      </div>
                    )}
                    
                    {result.indication && (
                      <div className="mt-2 text-sm text-slate-700">
                        <span className="font-semibold">Use:</span> {result.indication}
                      </div>
                    )}
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
                  {result.pharmacyIsOpen !== undefined && (
                    <div className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${result.pharmacyIsOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {result.pharmacyIsOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                    </div>
                  )}
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
                  <div className="mt-1 text-lg font-black text-emerald-700">GH₵ {Number(result.inventoryPrice ?? result.price ?? 0).toFixed(2)}</div>
                  {result.expiryDate && (
                    <div className="mt-2 text-xs text-slate-600">
                      <span className="font-semibold">Expires:</span> {new Date(result.expiryDate).toLocaleDateString()}
                    </div>
                  )}
                  {result.batchNumber && (
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold">Batch:</span> {result.batchNumber}
                    </div>
                  )}
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
                    className="primary-button flex-1 flex items-center justify-center gap-2"
                    onClick={() => handleAddToCart(result)}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Add to Cart
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

      {/* Add to Cart Modal */}
      {addToCartItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Add to Cart</h3>
              <button
                onClick={() => setAddToCartItem(null)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X className="h-5 w-5 text-slate-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-4">
                <p className="text-sm font-semibold text-slate-600">Medicine</p>
                <p className="text-lg font-bold text-slate-900">{addToCartItem.drugName}</p>
                <p className="text-sm text-slate-600">{addToCartItem.brandName}</p>
                {(addToCartItem.drugType || addToCartItem.strength) && (
                  <div className="mt-2 flex gap-1">
                    {addToCartItem.drugType && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {addToCartItem.drugType}
                      </span>
                    )}
                    {addToCartItem.strength && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                        {addToCartItem.strength}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="border-b border-slate-200 pb-4">
                <p className="text-sm font-semibold text-slate-600">Pharmacy</p>
                <p className="text-lg font-bold text-slate-900">{addToCartItem.pharmacyName}</p>
                <p className="text-sm text-slate-600">{addToCartItem.address}</p>
                <p className={`text-xs font-semibold mt-1 ${addToCartItem.pharmacyIsOpen ? 'text-emerald-600' : 'text-red-600'}`}>
                  {addToCartItem.pharmacyIsOpen ? '🟢 OPEN' : '🔴 CLOSED'}
                </p>
              </div>

              <div className="border-b border-slate-200 pb-4">
                <p className="text-sm font-semibold text-slate-600">Price</p>
                <p className="text-2xl font-bold text-emerald-700">GH₵ {(addToCartItem.inventoryPrice ?? addToCartItem.price ?? 0).toFixed(2)}</p>
                {addToCartItem.expiryDate && (
                  <p className="text-xs text-slate-500 mt-1">
                    Expires: {new Date(addToCartItem.expiryDate).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="pb-4">
                <p className="text-sm font-semibold text-slate-600 mb-2">Quantity</p>
                <div className="flex items-center gap-2 rounded bg-slate-100 p-2 w-fit">
                  <button
                    type="button"
                    onClick={() => setCartQuantity(Math.max(1, cartQuantity - 1))}
                    className="rounded p-1 hover:bg-slate-200 transition"
                  >
                    <Minus className="h-4 w-4 text-slate-600" />
                  </button>
                  <input
                    type="number"
                    value={cartQuantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= addToCartItem.stock) {
                        setCartQuantity(val);
                      }
                    }}
                    min="1"
                    max={addToCartItem.stock}
                    className="w-12 flex-1 border-0 bg-transparent text-center text-sm font-semibold text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setCartQuantity(Math.min(addToCartItem.stock, cartQuantity + 1))}
                    className="rounded p-1 hover:bg-slate-200 transition"
                  >
                    <Plus className="h-4 w-4 text-slate-600" />
                  </button>
                  <span className="text-xs text-slate-500 ml-2">/ {addToCartItem.stock}</span>
                </div>
              </div>

              <div className="rounded-lg bg-slate-100 p-3">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-bold text-slate-900">
                    GH₵ {((addToCartItem.inventoryPrice ?? addToCartItem.price ?? 0) * cartQuantity).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAddToCartItem(null)}
                  className="secondary-button flex-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmAddToCart}
                  className="primary-button flex-1 flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

