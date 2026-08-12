export function GenericPage({ title }: { title: string }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-slate-600">This page is wired for the PharmaFind workflow and ready for API-driven actions.</p>
    </main>
  );
}
