import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api';
import { MapView } from '../components/MapView';

type Result = { pharmacyName: string; address: string; stockQuantity: number; distanceKm: number | null; latitude: number; longitude: number; openingStatus: boolean; };

export function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.get('/drugs/search', { params: { q, lat: 5.6501, lng: -0.1869 } });
      setResults(data.results ?? []);
    } finally {
      setLoading(false);
    }
  };

  const points = results.map((r) => ({ lat: r.latitude, lng: r.longitude, label: `${r.pharmacyName} (${r.stockQuantity})` }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Medicine search</h1>
      <form onSubmit={onSearch} className="mt-4 flex gap-2">
        <input aria-label="Search medicines" className="flex-1 rounded border px-3 py-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by brand, generic or category" />
        <button className="rounded bg-blue-600 px-4 py-2 text-white" type="submit">Search</button>
      </form>
      {loading && <p className="mt-3">Loading...</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          {results.map((r) => (
            <article key={`${r.pharmacyName}-${r.address}`} className="rounded border bg-white p-3">
              <h2 className="font-medium">{r.pharmacyName}</h2>
              <p className="text-sm text-slate-600">{r.address}</p>
              <p className="text-sm">Stock: {r.stockQuantity} • {r.openingStatus ? 'Open' : 'Closed'} • {r.distanceKm?.toFixed(2)} km</p>
            </article>
          ))}
          {!loading && results.length === 0 && <p className="text-slate-600">No medicines found.</p>}
        </div>
        <MapView points={points} center={[5.6501, -0.1869]} />
      </div>
    </main>
  );
}
