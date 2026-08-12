import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type EmergencyResult = { pharmacyName: string; drugName: string; stockQuantity: number; distanceKm: number; openingStatus: boolean; emergencyScore: number };

export function EmergencyPage() {
  const [results, setResults] = useState<EmergencyResult[]>([]);
  const [disclaimer, setDisclaimer] = useState('');

  useEffect(() => {
    api.get('/drugs/emergency/search', { params: { lat: 5.6501, lng: -0.1869 } }).then(({ data }) => {
      setResults(data.results ?? []);
      setDisclaimer(data.disclaimer ?? '');
    });
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-red-700">Emergency mode</h1>
      <p className="mt-2 rounded border border-red-200 bg-red-50 p-3 text-sm">{disclaimer}</p>
      <div className="mt-4 space-y-2">
        {results.map((r) => (
          <article key={`${r.pharmacyName}-${r.drugName}`} className="rounded border bg-white p-3">
            <h2 className="font-medium">{r.drugName} @ {r.pharmacyName}</h2>
            <p className="text-sm">Score {r.emergencyScore} • {r.distanceKm.toFixed(2)} km • Stock {r.stockQuantity} • {r.openingStatus ? 'Open' : 'Closed'}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
