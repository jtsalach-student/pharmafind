import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold">PharmaFind</h1>
      <p className="mt-2 text-slate-700">Smart medicine availability and emergency healthcare logistics for Legon.</p>
      <div className="mt-6 flex gap-3">
        <Link className="rounded bg-blue-600 px-4 py-2 text-white" to="/search">Find medicine</Link>
        <Link className="rounded border px-4 py-2" to="/emergency">Emergency mode</Link>
      </div>
    </main>
  );
}
