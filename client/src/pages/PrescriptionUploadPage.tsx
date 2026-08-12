import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api';

export function PrescriptionUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<string>('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post('/prescriptions', form);
    setResult(`Status: ${data.prescription.status}. OCR confidence: ${data.prescription.ocrConfidence ?? 0}`);
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Upload prescription</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input aria-label="Prescription file" type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="rounded bg-blue-600 px-4 py-2 text-white" type="submit">Upload</button>
      </form>
      {result && <p className="mt-3 text-sm">{result}</p>}
      <p className="mt-2 text-xs text-amber-700">OCR output requires pharmacist review and does not auto-approve prescriptions.</p>
    </main>
  );
}
