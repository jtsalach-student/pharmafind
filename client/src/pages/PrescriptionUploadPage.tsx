import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  ShieldCheck,
  Stethoscope,
  UploadCloud,
  XCircle
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { getUser } from '../lib/auth';
import { getSupabaseClient } from '../lib/supabase';
import { createInAppNotification, notifyUsersWithRole } from '../lib/notifications';

type PrescriptionRouteState = {
  pharmacy?: { pharmacyId?: string; pharmacyName?: string; address?: string; phone?: string };
  drugId?: string;
  drugName?: string;
  quantity?: number;
  unitPrice?: number;
  distanceKm?: number;
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

  // Waiting for pharmacist approval state
  const [submittedPrescriptionId, setSubmittedPrescriptionId] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'CLARIFICATION_REQUESTED'>('PENDING_REVIEW');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

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
      setErrorMessage('Quantity must be greater than zero, and delivery address/phone number are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setStatus('Uploading prescription for pharmacist review');

      const user = getUser();
      let userId = user?.id;

      const supabase = getSupabaseClient();
      if (!userId) {
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user?.id) {
          userId = authData.user.id;
        }
      }

      if (!userId) {
        throw new Error('Please sign in before uploading your prescription.');
      }

      let prescriptionId: string | null = null;

      // 1. Attempt Express backend API endpoint if reachable
      try {
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

        if (response.data?.prescription?.id) {
          prescriptionId = response.data.prescription.id;
        }
      } catch (apiErr: any) {
        console.warn(
          '[PrescriptionUpload] API server upload unavailable or returned status ' +
          (apiErr?.response?.status || 'network') +
          '. Proceeding with direct Supabase storage & database submission.',
          apiErr?.message
        );
      }

      // 2. Direct Supabase Storage + Database Fallback
      if (!prescriptionId) {
        const fileName = file.name;
        const mimeType = file.type || 'image/jpeg';
        const fileSize = file.size;
        let storageFilePath = previewUrl || `prescriptions/${userId}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        // Attempt Supabase storage bucket upload if available
        try {
          const { error: storageError } = await supabase.storage
            .from('prescriptions')
            .upload(storageFilePath, file, { upsert: true });

          if (storageError) {
            console.info('[PrescriptionUpload] Storage bucket notice:', storageError.message);
          }
        } catch (storageCatch) {
          console.info('[PrescriptionUpload] Supabase Storage upload skipped:', storageCatch);
        }

        // Insert Prescription record
        const { data: prescData, error: prescError } = await supabase
          .from('Prescription')
          .insert([{
            userId: userId,
            pharmacyId: routeState.pharmacy?.pharmacyId || null,
            drugId: routeState.drugId || null,
            filePath: storageFilePath,
            originalFileName: fileName,
            mimeType: mimeType,
            fileSize: fileSize,
            quantity: Number.isFinite(quantity) ? quantity : 1,
            status: 'PENDING_REVIEW',
            ocrText: 'Prescription uploaded - awaiting pharmacist clinical review',
            ocrConfidence: 0
          }])
          .select()
          .single();

        if (prescError || !prescData) {
          throw new Error(prescError?.message || 'Failed to record prescription in database.');
        }

        prescriptionId = prescData.id;

        // Insert initial DeliveryRequest record
        const { error: delError } = await supabase
          .from('DeliveryRequest')
          .insert([{
            userId: userId,
            prescriptionId: prescriptionId,
            status: 'REQUESTED',
            quantity: Number.isFinite(quantity) ? quantity : 1,
            deliveryAddress: deliveryAddress.trim(),
            phoneNumber: phoneNumber.trim()
          }]);

        if (delError) {
          console.warn('[PrescriptionUpload] DeliveryRequest creation notice:', delError.message);
        }
      }

      setSubmittedPrescriptionId(prescriptionId);
      setApprovalStatus('PENDING_REVIEW');
      setStatus('Waiting for pharmacist approval');

      // Dispatch User Notification: Prescription Submitted
      void createInAppNotification(
        userId,
        `Prescription Submitted: Your prescription for ${routeState.drugName || 'Medication'} has been uploaded and is pending pharmacist review.`,
        'PRESCRIPTION_SUBMITTED'
      );

      // Dispatch Pharmacist Notification: New Prescription Submitted
      void notifyUsersWithRole(
        'PHARMACIST',
        `New Prescription Submitted: A new prescription for ${routeState.drugName || 'Medication'} requires clinical review.`,
        'NEW_PRESCRIPTION_SUBMITTED'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to upload prescription.';
      setErrorMessage(message);
      setStatus('Prescription upload failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Poll & subscribe to prescription approval status
  useEffect(() => {
    if (!submittedPrescriptionId) return;

    let isMounted = true;

    const checkStatus = async () => {
      try {
        const client = getSupabaseClient();
        const { data, error } = await client
          .from('Prescription')
          .select('id, status, reviewReason')
          .eq('id', submittedPrescriptionId)
          .maybeSingle();

        if (error || !data || !isMounted) return;

        if (data.status === 'APPROVED') {
          setApprovalStatus('APPROVED');
          setStatus('Prescription approved • proceeding to payment');

          const user = getUser();
          if (user?.id) {
            void createInAppNotification(
              user.id,
              `Prescription Approved: Your prescription for ${routeState.drugName || 'Medication'} has been approved by the pharmacist!`,
              'PRESCRIPTION_APPROVED'
            );
          }

          setTimeout(() => {
            if (isMounted) {
              navigate('/payment', {
                replace: true,
                state: {
                  prescriptionId: submittedPrescriptionId,
                  drugId: routeState.drugId,
                  drugName: routeState.drugName,
                  pharmacyId: routeState.pharmacy?.pharmacyId,
                  pharmacyName: routeState.pharmacy?.pharmacyName,
                  quantity,
                  unitPrice: routeState.unitPrice ?? 0,
                  distanceKm: routeState.distanceKm ?? 0,
                  requiresRx: true
                }
              });
            }
          }, 1500);
        } else if (data.status === 'REJECTED') {
          setApprovalStatus('REJECTED');
          setRejectionReason(data.reviewReason || 'Prescription rejected by reviewing pharmacist.');
          setStatus('Prescription rejected');
        } else if (data.status === 'CLARIFICATION_REQUESTED') {
          setApprovalStatus('CLARIFICATION_REQUESTED');
          setRejectionReason(data.reviewReason || 'Pharmacist requested clarification.');
          setStatus('Clarification requested');
        }
      } catch (err) {
        console.warn('Status check notice:', err);
      }
    };

    void checkStatus();

    const client = getSupabaseClient();
    const channel = client.channel(`prescription-approval-${submittedPrescriptionId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'Prescription', filter: `id=eq.${submittedPrescriptionId}` },
      () => {
        void checkStatus();
      }
    );
    void channel.subscribe();

    const pollTimer = setInterval(() => {
      void checkStatus();
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(pollTimer);
      client.removeChannel(channel);
    };
  }, [submittedPrescriptionId, navigate, quantity, routeState]);

  // WAITING FOR APPROVAL SCREEN
  if (submittedPrescriptionId) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-slate-200 bg-white/90 p-8 shadow-[0_25px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl space-y-8">
          {/* Header */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-600">
                <Stethoscope className="h-4 w-4" /> Clinical Verification Required
              </div>
              <h1 className="mt-1 text-2xl sm:text-3xl font-black text-slate-900">
                {approvalStatus === 'APPROVED'
                  ? 'Prescription Approved!'
                  : approvalStatus === 'REJECTED'
                  ? 'Prescription Rejected'
                  : 'Waiting for Prescription Approval'}
              </h1>
            </div>

            <span
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider ${
                approvalStatus === 'APPROVED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : approvalStatus === 'REJECTED'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-amber-100 text-amber-800 animate-pulse'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              {approvalStatus.replace('_', ' ')}
            </span>
          </div>

          {/* Status Message Cards */}
          {approvalStatus === 'PENDING_REVIEW' && (
            <div className="rounded-[24px] border-2 border-amber-200 bg-amber-50/80 p-6 space-y-3 text-center">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-amber-600" />
              <h3 className="text-lg font-black text-slate-900">Pharmacist Review in Progress</h3>
              <p className="max-w-md mx-auto text-sm text-slate-600">
                Your prescription has been submitted to licensed pharmacists for clinical verification. Once approved, you will be automatically redirected to the payment page.
              </p>
              <p className="text-xs font-bold text-amber-800 uppercase tracking-widest pt-2">
                Do not close this page • Real-time auto-redirecting
              </p>
            </div>
          )}

          {approvalStatus === 'APPROVED' && (
            <div className="rounded-[24px] border-2 border-emerald-300 bg-emerald-50 p-6 space-y-3 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <h3 className="text-xl font-black text-slate-900">Prescription Approved!</h3>
              <p className="text-sm text-emerald-800">
                The pharmacist verified and approved your prescription. Redirecting you to payment now...
              </p>
              <div className="pt-2">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
              </div>
            </div>
          )}

          {approvalStatus === 'REJECTED' && (
            <div className="rounded-[24px] border-2 border-red-300 bg-red-50 p-6 space-y-4 text-center">
              <XCircle className="mx-auto h-12 w-12 text-red-600" />
              <h3 className="text-xl font-black text-slate-900">Review Decision: Rejected</h3>
              <p className="text-sm text-red-800">
                Reason: {rejectionReason || 'Prescription could not be verified by pharmacist.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmittedPrescriptionId(null);
                  setApprovalStatus('PENDING_REVIEW');
                  setFile(null);
                  setPreviewUrl(null);
                }}
                className="secondary-button px-6 py-2.5 text-xs font-bold"
              >
                Upload a New Prescription
              </button>
            </div>
          )}

          {/* Prescription Order Details Summary */}
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Order Details
            </div>
            <div className="grid gap-4 sm:grid-cols-2 text-sm text-slate-700">
              <div>
                <span className="text-slate-400 block text-xs">Medication:</span>
                <span className="font-bold text-slate-900">{routeState.drugName ?? 'Prescription Drug'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">Quantity:</span>
                <span className="font-bold text-slate-900">{quantity} unit(s)</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">Pickup Pharmacy:</span>
                <span className="font-bold text-emerald-700">{routeState.pharmacy?.pharmacyName ?? 'PharmaFind Network'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">Estimated Total:</span>
                <span className="font-bold text-slate-900">GH₵ {(Number(routeState.unitPrice ?? 0) * quantity).toFixed(2)}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-400 block text-xs">Delivery Address:</span>
                <span className="font-medium text-slate-800">{deliveryAddress}</span>
              </div>
            </div>

            {previewUrl && (
              <div className="pt-4 border-t border-slate-200">
                <span className="text-slate-400 block text-xs mb-2">Uploaded Document:</span>
                <img src={previewUrl} alt="Prescription" className="h-44 w-auto rounded-xl object-contain border border-slate-200 bg-white" />
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  // UPLOAD FORM SCREEN
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
              {isSubmitting ? 'Submitting...' : 'Upload for Pharmacist Review'} <ArrowRight className="ml-2 h-4 w-4" />
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
                <div>Unit price: GH₵ {Number(routeState.unitPrice ?? 0).toFixed(2)}</div>
                <div>Subtotal: GH₵ {(Number(routeState.unitPrice ?? 0) * quantity).toFixed(2)}</div>
                <div>Pharmacy: {routeState.pharmacy?.pharmacyName ?? 'Selected pharmacy'}</div>
                <div>Verification: Required before payment</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default PrescriptionUploadPage;
