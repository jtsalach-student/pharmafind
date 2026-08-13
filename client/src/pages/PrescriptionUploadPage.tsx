import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, FileText, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

type PrescriptionRouteState = {
  pharmacy?: { pharmacyId?: string; pharmacyName?: string; address?: string; phone?: string };
  drugId?: string;
  drugName?: string;
  quantity?: number;
  requiresRx?: boolean;
};

export function PrescriptionUploadPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const routeState = (state as PrescriptionRouteState | null) ?? {};

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('Prescription upload required');
  const [quantity, setQuantity] = useState<number>(routeState.quantity ?? 1);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onFileChange = (nextFile: File | null) => {
    setFile(nextFile);
    setStatus(nextFile ? 'File ready for pharmacist review' : 'Prescription upload required');

    if (!nextFile) {
      setPreviewUrl(null);
      return;
    }

    if (nextFile.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(nextFile));
    } else {
      setPreviewUrl(null);
    }
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setErrorMessage('Please upload a prescription before continuing.');
      return;
    }
    if (!deliveryAddress.trim() || !phoneNumber.trim() || quantity <= 0) {
      setErrorMessage('Quantity, delivery address, and phone number are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setStatus('Uploading prescription for review');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('quantity', String(quantity));
      formData.append('deliveryAddress', deliveryAddress.trim());
      formData.append('phoneNumber', phoneNumber.trim());
      if (routeState.pharmacy?.pharmacyId) formData.append('pharmacyId', routeState.pharmacy.pharmacyId);
      if (routeState.drugId) formData.append('drugId', routeState.drugId);

      const response = await api.post('/prescriptions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const prescriptionId = response.data?.prescription?.id;
      if (!prescriptionId) {
        throw new Error('Server did not return prescription ID.');
      }

      setStatus('Prescription uploaded • proceeding to payment');
      
      // Redirect to payment page with prescription info
      navigate('/payment', {
        replace: true,
        state: {
          prescriptionId,
          drugId: routeState.drugId,
          drugName: routeState.drugName,
          pharmacyId: routeState.pharmacy?.pharmacyId,
          pharmacyName: routeState.pharmacy?.pharmacyName,
          quantity,
          unitPrice: 0,
          deliveryFee: 2.5,
          requiresRx: true
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to upload prescription.';
      setErrorMessage(message);
      setStatus('Prescription upload failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-slate-200 bg-white/80 p-6 shadow-[0_25px_70px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Prescription workflow</div>
            <h1 className="mt-2 text-3xl font-black text-slate-900">Upload prescription</h1>
          </div>

          <div className="rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            {status}
          </div>
        </div>

        {errorMessage && (
          <div className="mb-5 rounded-[24px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <motion.form onSubmit={onSubmit} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <label className="group flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-sky-200 bg-sky-50/60 p-6 text-center transition hover:border-sky-300 hover:bg-sky-50">
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                className="hidden"
              />
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-sm">
                <UploadCloud className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-xl font-black text-slate-900">Upload your prescription</h2>
              <p className="mt-2 max-w-md text-sm text-slate-600">Accepted formats: JPG, PNG, PDF. Maximum size: 5MB.</p>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Quantity
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value) || 1)}
                  className="input-shell mt-2"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Phone number
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  className="input-shell mt-2"
                  placeholder="020 000 0000"
                />
              </label>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Delivery address
              <textarea
                value={deliveryAddress}
                onChange={(event) => setDeliveryAddress(event.target.value)}
                className="input-shell mt-2 min-h-[120px]"
                placeholder="Enter the address where the medicine should be delivered"
              />
            </label>

            {file && (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-sm">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{file.name}</div>
                    <div className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB • {file.type || 'Document'}</div>
                  </div>
                </div>
              </div>
            )}

            <button type="submit" className="primary-button w-full" disabled={!file || isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Upload Prescription'} <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </motion.form>

          <div className="space-y-5">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <div className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Preview</div>
              {previewUrl ? (
                <img src={previewUrl} alt="Prescription preview" className="h-64 w-full rounded-[20px] object-cover shadow-sm" />
              ) : (
                <div className="flex h-64 items-center justify-center rounded-[20px] border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                  No image preview available
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Review workflow
              </div>
              <div className="rounded-2xl bg-white p-4 text-sm leading-6 text-slate-700 space-y-1">
                <div>Medication: {routeState.drugName ?? 'Selected drug'}</div>
                <div>Quantity: {quantity}</div>
                <div>Pharmacy: {routeState.pharmacy?.pharmacyName ?? 'Selected pharmacy'}</div>
                <div>Verification: Pending pharmacist review</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

