import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  PackageCheck,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  ThumbsDown,
  ThumbsUp,
  Truck,
  User,
  Boxes
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { getPrescriptions, type PrescriptionRecord } from '../lib/data';
import { api } from '../lib/api';
import { getSupabaseClient } from '../lib/supabase';
import { sendDeliveryNotification } from '../lib/routing';
import { createInAppNotification, notifyUsersWithRole } from '../lib/notifications';

type ReviewState = {
  prescriptionId: string | null;
  decision: 'APPROVED' | 'REJECTED' | 'CLARIFICATION_REQUESTED' | null;
  reason: string;
  isSubmitting: boolean;
};

export type PharmacyOrderItem = {
  id: string;
  orderId: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  prescriptionId: string;
  drugName: string;
  drugType?: string;
  strength?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  pharmacyId?: string;
  pharmacyName: string;
  status: 'PENDING_PREPARATION' | 'PREPARING' | 'READY_FOR_PICKUP' | 'COLLECTED' | 'IN_TRANSIT' | 'DELIVERED' | 'COMPLETED';
  rawStatus: string;
  driverName?: string;
  driverPhone?: string;
  createdAt: string;
  updatedAt?: string;
};

export function PharmacistReviewPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'reviews' | 'pending' | 'preparing' | 'ready' | 'collected' | 'completed'>('reviews');

  // Prescriptions state
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(true);
  const [prescError, setPrescError] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>({
    prescriptionId: null,
    decision: null,
    reason: '',
    isSubmitting: false
  });
  const [reviewMessage, setReviewMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Orders state
  const [orders, setOrders] = useState<PharmacyOrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderActionLoading, setOrderActionLoading] = useState<string | null>(null);
  const [orderMessage, setOrderMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Live preparing tracking map helper (always reads direct from localStorage to avoid stale closures)
  const getLivePreparingMap = (): Record<string, boolean> => {
    try {
      const saved = localStorage.getItem('pharmafind_preparing_orders');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  };

  const [, setPreparingMap] = useState<Record<string, boolean>>(() => getLivePreparingMap());

  const savePreparingMap = (updated: Record<string, boolean>) => {
    try {
      localStorage.setItem('pharmafind_preparing_orders', JSON.stringify(updated));
    } catch {}
    setPreparingMap(updated);
  };

  // Fetch prescriptions
  const fetchPrescriptions = async () => {
    try {
      setLoadingPrescriptions(true);
      setPrescError(null);
      const data = await getPrescriptions();
      const pending = data.filter((p) => p.status === 'PENDING_REVIEW');
      setPrescriptions(pending);
    } catch (err) {
      setPrescError(err instanceof Error ? err.message : 'Failed to load prescriptions');
    } finally {
      setLoadingPrescriptions(false);
    }
  };

  // Fetch all orders & delivery requests
  const fetchOrders = async () => {
    try {
      setLoadingOrders(true);
      const client = getSupabaseClient();
      const livePrepMap = getLivePreparingMap();

      const { data: deliveryRows, error: reqError } = await client
        .from('DeliveryRequest')
        .select('id, userId, prescriptionId, status, driverId, requestedAt, updatedAt')
        .order('requestedAt', { ascending: false })
        .limit(50);

      if (reqError) throw reqError;

      const rows = deliveryRows ?? [];
      const prescIds = [...new Set(rows.map((r) => r.prescriptionId).filter(Boolean))];
      const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
      const driverIds = [...new Set(rows.map((r) => r.driverId).filter(Boolean))];

      const [prescRes, userRes, driverRes] = await Promise.all([
        prescIds.length > 0 ? client.from('Prescription').select('*').in('id', prescIds) : Promise.resolve({ data: [] as any[] }),
        userIds.length > 0 ? client.from('User').select('id, fullName, username, phone').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
        driverIds.length > 0 ? client.from('Driver').select('id, userId, vehicleType').in('id', driverIds) : Promise.resolve({ data: [] as any[] })
      ]);

      const prescriptionsList = prescRes.data ?? [];
      const usersList = userRes.data ?? [];
      const driversList = driverRes.data ?? [];

      const pharmacyIds = [...new Set(prescriptionsList.map((p) => p.pharmacyId).filter(Boolean))];
      const drugIds = [...new Set(prescriptionsList.map((p) => p.drugId).filter(Boolean))];

      const [pharmRes, drugRes, invRes] = await Promise.all([
        pharmacyIds.length > 0 ? client.from('Pharmacy').select('id, name, address, phone').in('id', pharmacyIds) : Promise.resolve({ data: [] as any[] }),
        drugIds.length > 0 ? client.from('Drug').select('id, genericName, brandName, price, drugType, strength').in('id', drugIds) : Promise.resolve({ data: [] as any[] }),
        (pharmacyIds.length > 0 && drugIds.length > 0)
          ? client.from('Inventory').select('pharmacyId, drugId, price').in('pharmacyId', pharmacyIds).in('drugId', drugIds)
          : Promise.resolve({ data: [] as any[] })
      ]);

      const userMap = new Map(usersList.map((u) => [u.id, u]));
      const prescMap = new Map(prescriptionsList.map((p) => [p.id, p]));
      const driverMap = new Map(driversList.map((d) => [d.id, d]));
      const pharmMap = new Map((pharmRes.data ?? []).map((p) => [p.id, p]));
      const drugMap = new Map((drugRes.data ?? []).map((d) => [d.id, d]));
      const invMap = new Map((invRes.data ?? []).map((i) => [`${i.pharmacyId}-${i.drugId}`, i]));

      const formattedOrders: PharmacyOrderItem[] = rows.map((row) => {
        const presc = prescMap.get(row.prescriptionId);
        const user = userMap.get(row.userId);
        const driver = driverMap.get(row.driverId);
        const pharm = presc?.pharmacyId ? pharmMap.get(presc.pharmacyId) : undefined;
        const drug = presc?.drugId ? drugMap.get(presc.drugId) : undefined;
        const inv = (presc?.pharmacyId && presc?.drugId) ? invMap.get(`${presc.pharmacyId}-${presc.drugId}`) : undefined;

        const unitPrice = Number(inv?.price ?? drug?.price ?? 0);
        const count = Number(presc?.quantity ?? 1);
        const totalPrice = Number((unitPrice * count).toFixed(2));

        // Map status
        let status: PharmacyOrderItem['status'] = 'PENDING_PREPARATION';
        const raw = (row.status || 'REQUESTED').toUpperCase();

        if (raw === 'COMPLETED') {
          status = 'COMPLETED';
        } else if (raw === 'DELIVERED') {
          status = 'DELIVERED';
        } else if (raw === 'IN_TRANSIT') {
          status = 'IN_TRANSIT';
        } else if (raw === 'COLLECTED') {
          status = 'COLLECTED';
        } else if (raw === 'ASSIGNED' || raw === 'READY_FOR_PICKUP') {
          status = 'READY_FOR_PICKUP';
        } else {
          // REQUESTED
          status = livePrepMap[row.id] ? 'PREPARING' : 'PENDING_PREPARATION';
        }

        return {
          id: row.id,
          orderId: `ORD-${row.id.slice(0, 8).toUpperCase()}`,
          userId: row.userId,
          customerName: user?.fullName || user?.username || 'Customer',
          customerPhone: user?.phone || '024 000 0000',
          deliveryAddress: pharm?.address ? `Near ${pharm.address}, Accra` : 'Legon, Accra',
          prescriptionId: row.prescriptionId,
          drugName: drug ? `${drug.genericName}${drug.brandName ? ` (${drug.brandName})` : ''}` : 'Prescription Medication',
          drugType: drug?.drugType,
          strength: drug?.strength,
          quantity: count,
          unitPrice,
          totalPrice,
          pharmacyId: pharm?.id,
          pharmacyName: pharm?.name ?? 'PharmaFind Pharmacy',
          status,
          rawStatus: raw,
          driverName: driver ? 'Assigned Driver' : undefined,
          createdAt: row.requestedAt || new Date().toISOString(),
          updatedAt: row.updatedAt
        };
      });

      setOrders(formattedOrders);
    } catch (err) {
      console.error('Error fetching pharmacy orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    void fetchPrescriptions();
    void fetchOrders();

    // Passive background poll every 15 seconds only.
    // No Realtime subscription — pharmacist writes trigger their own channel
    // which causes a cascade of fetchOrders() re-renders and rapid flicker.
    const timer = setInterval(() => {
      void fetchPrescriptions();
      void fetchOrders();
    }, 15000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  // Pharmacist Action: Review Prescription
  const handleReviewClick = (prescriptionId: string) => {
    setReviewState({
      prescriptionId,
      decision: null,
      reason: '',
      isSubmitting: false
    });
    setReviewMessage(null);
  };

  const handleCancelReview = () => {
    setReviewState({
      prescriptionId: null,
      decision: null,
      reason: '',
      isSubmitting: false
    });
    setReviewMessage(null);
  };

  const handleSubmitReview = async () => {
    if (!reviewState.prescriptionId || !reviewState.decision) {
      setReviewMessage({ type: 'error', text: 'Please select an action before submitting.' });
      return;
    }

    if (!reviewState.reason.trim()) {
      setReviewMessage({ type: 'error', text: 'Please provide a reason for your decision.' });
      return;
    }

    try {
      setReviewState((prev) => ({ ...prev, isSubmitting: true }));
      setReviewMessage(null);

      try {
        await api.patch(`/prescriptions/${reviewState.prescriptionId}/review`, {
          decision: reviewState.decision,
          reason: reviewState.reason.trim()
        });
      } catch {
        const client = getSupabaseClient();
        const { error: sbErr } = await client
          .from('Prescription')
          .update({
            status: reviewState.decision,
            reviewReason: reviewState.reason.trim(),
            reviewedAt: new Date().toISOString()
          })
          .eq('id', reviewState.prescriptionId);

        if (sbErr) throw sbErr;
      }

      // Dispatch User Notification for Decision
      const targetPresc = prescriptions.find((p) => p.id === reviewState.prescriptionId);
      if (targetPresc?.userId) {
        const drugLabel = targetPresc.drug?.genericName || targetPresc.originalFileName || 'Medication';
        if (reviewState.decision === 'APPROVED') {
          void createInAppNotification(
            targetPresc.userId,
            `Prescription Approved: Your prescription for ${drugLabel} has been approved by the pharmacist. You can now proceed to payment.`,
            'PRESCRIPTION_APPROVED'
          );
        } else if (reviewState.decision === 'REJECTED') {
          void createInAppNotification(
            targetPresc.userId,
            `Prescription Rejected: Your prescription for ${drugLabel} was rejected. Reason: ${reviewState.reason.trim()}`,
            'PRESCRIPTION_REJECTED'
          );
        } else {
          void createInAppNotification(
            targetPresc.userId,
            `Prescription Clarification Requested: Pharmacist notes: ${reviewState.reason.trim()}`,
            'PRESCRIPTION_CLARIFICATION'
          );
        }
      }

      setPrescriptions((prev) => prev.filter((p) => p.id !== reviewState.prescriptionId));
      setReviewMessage({
        type: 'success',
        text: `Prescription ${reviewState.decision.toLowerCase().replace('_', ' ')} successfully.`
      });

      setTimeout(() => {
        setReviewState({
          prescriptionId: null,
          decision: null,
          reason: '',
          isSubmitting: false
        });
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to submit review.';
      setReviewMessage({ type: 'error', text: message });
    } finally {
      setReviewState((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Pharmacy Action 1: Prepare Order
  const handlePrepareOrder = async (order: PharmacyOrderItem) => {
    try {
      setOrderActionLoading(order.id);
      setOrderMessage(null);

      // Save to preparing map
      const updated = { ...getLivePreparingMap(), [order.id]: true };
      savePreparingMap(updated);

      // Update local state immediately
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: 'PREPARING' } : o))
      );

      // Send User Notification: "Order Being Prepared"
      await sendDeliveryNotification(
        order.userId,
        `Order Being Prepared: Pharmacist is preparing your order #${order.orderId} (${order.drugName}) at ${order.pharmacyName}.`,
        'ORDER_BEING_PREPARED'
      );

      setOrderMessage({
        type: 'success',
        text: `Order #${order.orderId} is now marked as PREPARING.`
      });

      setActiveTab('preparing');
    } catch (err) {
      setOrderMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to start preparing order.'
      });
    } finally {
      setOrderActionLoading(null);
    }
  };

  // Pharmacy Action 2: Mark Ready For Pickup
  const handleMarkReadyForPickup = async (order: PharmacyOrderItem) => {
    try {
      setOrderActionLoading(order.id);
      setOrderMessage(null);

      // Clean up preparing map
      const updated = { ...getLivePreparingMap() };
      delete updated[order.id];
      savePreparingMap(updated);

      // Update local state immediately
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: 'READY_FOR_PICKUP' } : o))
      );

      const client = getSupabaseClient();
      const { error: sbErr } = await client
        .from('DeliveryRequest')
        .update({
          status: 'ASSIGNED',
          updatedAt: new Date().toISOString()
        })
        .eq('id', order.id);

      if (sbErr) throw sbErr;

      // Send User Notification: "Order Ready For Pickup"
      await sendDeliveryNotification(
        order.userId,
        `Order Ready For Pickup: Your order #${order.orderId} (${order.drugName}) is packed and ready for driver pickup at ${order.pharmacyName}.`,
        'ORDER_READY_FOR_PICKUP'
      );

      // Broadcast to Drivers: "New Delivery Available"
      void notifyUsersWithRole(
        'DRIVER',
        `New Delivery Available: Order #${order.orderId} (${order.drugName}) is ready for pickup at ${order.pharmacyName}.`,
        'NEW_DELIVERY_AVAILABLE'
      );

      setOrderMessage({
        type: 'success',
        text: `Order #${order.orderId} marked as READY FOR PICKUP!`
      });

      setActiveTab('ready');
    } catch (err) {
      setOrderMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to mark order ready for pickup.'
      });
    } finally {
      setOrderActionLoading(null);
    }
  };

  // Pharmacy Action 3: Confirm Driver Collection
  const handleConfirmDriverCollection = async (order: PharmacyOrderItem) => {
    try {
      setOrderActionLoading(order.id);
      setOrderMessage(null);

      // Optimistic local update immediately
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: 'COLLECTED' } : o))
      );

      const client = getSupabaseClient();
      // Only update 'status' — do not include collectedAt/updatedAt
      // as Supabase RLS policies may reject unknown columns or the row
      // level trigger handles updatedAt automatically.
      const { error: sbErr } = await client
        .from('DeliveryRequest')
        .update({ status: 'COLLECTED' })
        .eq('id', order.id);

      if (sbErr) {
        // Rollback local update on failure
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, status: 'READY_FOR_PICKUP' } : o))
        );
        throw sbErr;
      }

      // Send User Notification: "Driver Collected Medicine"
      void sendDeliveryNotification(
        order.userId,
        `Driver Collected Medicine: Courier has collected your package from ${order.pharmacyName} and is preparing to start delivery.`,
        'DRIVER_COLLECTED_MEDICINE'
      );

      setOrderMessage({
        type: 'success',
        text: `Driver collection confirmed for Order #${order.orderId}!`
      });

      setActiveTab('collected');
    } catch (err) {
      setOrderMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to confirm driver collection.'
      });
    } finally {
      setOrderActionLoading(null);
    }
  };

  // Filtered lists
  const pendingOrders = orders.filter((o) => o.status === 'PENDING_PREPARATION');
  const preparingOrders = orders.filter((o) => o.status === 'PREPARING');
  const readyOrders = orders.filter((o) => o.status === 'READY_FOR_PICKUP');
  const collectedOrders = orders.filter((o) => o.status === 'COLLECTED');
  const completedOrders = orders.filter((o) => ['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(o.status));

  const filteredOrders = (
    activeTab === 'pending'
      ? pendingOrders
      : activeTab === 'preparing'
      ? preparingOrders
      : activeTab === 'ready'
      ? readyOrders
      : activeTab === 'collected'
      ? collectedOrders
      : activeTab === 'completed'
      ? completedOrders
      : []
  ).filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.orderId.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.drugName.toLowerCase().includes(q) ||
      o.pharmacyName.toLowerCase().includes(q)
    );
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header Banner */}
      <section className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Pharmacy Operations</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              Pharmacist Control Center
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage prescription approvals, medicine preparation, and driver pickup dispatch.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void fetchPrescriptions();
                void fetchOrders();
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              System Verified
            </div>
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <button
            type="button"
            onClick={() => setActiveTab('reviews')}
            className={`rounded-[22px] border p-4 text-left transition ${
              activeTab === 'reviews' ? 'border-sky-500 bg-sky-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
            }`}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Reviews</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{prescriptions.length}</div>
            <div className="mt-1 text-xs text-slate-500">Pending Rx</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`rounded-[22px] border p-4 text-left transition ${
              activeTab === 'pending' ? 'border-amber-500 bg-amber-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
            }`}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-amber-700">Pending</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{pendingOrders.length}</div>
            <div className="mt-1 text-xs text-slate-500">To prepare</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preparing')}
            className={`rounded-[22px] border p-4 text-left transition ${
              activeTab === 'preparing' ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
            }`}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-indigo-700">Preparing</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{preparingOrders.length}</div>
            <div className="mt-1 text-xs text-slate-500">Packing med</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ready')}
            className={`rounded-[22px] border p-4 text-left transition ${
              activeTab === 'ready' ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
            }`}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-blue-700">Ready Pickup</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{readyOrders.length}</div>
            <div className="mt-1 text-xs text-slate-500">Awaiting rider</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('collected')}
            className={`rounded-[22px] border p-4 text-left transition ${
              activeTab === 'collected' ? 'border-teal-500 bg-teal-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
            }`}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-teal-700">Collected</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{collectedOrders.length}</div>
            <div className="mt-1 text-xs text-slate-500">Driver picked</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`rounded-[22px] border p-4 text-left transition ${
              activeTab === 'completed' ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
            }`}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-700">Completed</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{completedOrders.length}</div>
            <div className="mt-1 text-xs text-slate-500">Delivered</div>
          </button>
        </div>
      </section>

      {/* Action Messages */}
      {orderMessage && (
        <div
          className={`mt-6 flex items-center gap-3 rounded-[24px] border p-4 ${
            orderMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {orderMessage.type === 'success' ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" /> : <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />}
          <p className="text-sm font-semibold">{orderMessage.text}</p>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('reviews')}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
            activeTab === 'reviews' ? 'bg-sky-600 text-white shadow-md shadow-sky-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Stethoscope className="h-4 w-4" />
          Prescriptions ({prescriptions.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
            activeTab === 'pending' ? 'bg-amber-600 text-white shadow-md shadow-amber-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="h-4 w-4" />
          Pending Orders ({pendingOrders.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('preparing')}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
            activeTab === 'preparing' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Boxes className="h-4 w-4" />
          Preparing ({preparingOrders.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ready')}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
            activeTab === 'ready' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <PackageCheck className="h-4 w-4" />
          Ready For Pickup ({readyOrders.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('collected')}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
            activeTab === 'collected' ? 'bg-teal-600 text-white shadow-md shadow-teal-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Truck className="h-4 w-4" />
          Collected ({collectedOrders.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
            activeTab === 'completed' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          In Transit / Completed ({completedOrders.length})
        </button>
      </div>

      {/* TAB 1: PRESCRIPTIONS REVIEW QUEUE */}
      {activeTab === 'reviews' && (
        <div className="mt-6">
          {prescError && (
            <div className="mb-6 flex gap-3 rounded-[28px] border border-red-200 bg-red-50 p-4">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-900">Error loading prescriptions</h3>
                <p className="text-sm text-red-700">{prescError}</p>
              </div>
            </div>
          )}

          {reviewMessage && (
            <div
              className={`mb-6 flex gap-3 rounded-[24px] border p-4 ${
                reviewMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {reviewMessage.type === 'success' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-red-600" />}
              <p className="text-sm font-semibold">{reviewMessage.text}</p>
            </div>
          )}

          {loadingPrescriptions ? (
            <div className="flex items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 p-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <p className="font-bold text-slate-700">No pending prescriptions in queue.</p>
              <p className="mt-1 text-xs text-slate-500">All uploaded prescriptions have been reviewed.</p>
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-slate-900">Pending Review Queue</h2>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700">
                    {prescriptions.length} items
                  </span>
                </div>

                <div className="mt-4 space-y-4">
                  {prescriptions.map((item, idx) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`rounded-[24px] border p-5 transition ${
                        reviewState.prescriptionId === item.id ? 'border-sky-500 bg-sky-50/50 ring-2 ring-sky-200' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex-1">
                          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                            {item.drug?.genericName || item.originalFileName || 'Prescription'}
                          </div>
                          <div className="mt-2 text-lg font-black text-slate-900">
                            {item.drug?.brandName || item.originalFileName || 'Prescription'}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">Awaiting clinical approval</div>

                          {item.drug && (
                            <div className="mt-3 space-y-1 text-xs text-slate-600 border-t border-slate-200 pt-2">
                              {item.drug.drugType && <div><span className="font-semibold">Type:</span> {item.drug.drugType}</div>}
                              {item.drug.strength && <div><span className="font-semibold">Strength:</span> {item.drug.strength}</div>}
                              {item.drug.indication && <div><span className="font-semibold">Indication:</span> {item.drug.indication}</div>}
                              {item.quantity && <div><span className="font-semibold">Quantity:</span> {item.quantity} units</div>}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => handleReviewClick(item.id)}
                            className="primary-button bg-sky-600 hover:bg-sky-700 text-xs px-4 py-2"
                          >
                            Review & Decide
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Review Action Form Panel */}
              <div className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
                <h2 className="text-xl font-black text-slate-900">Decision Panel</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Select a prescription on the left to approve, reject, or request clarification.
                </p>

                {reviewState.prescriptionId ? (
                  <div className="mt-6 space-y-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Decision</label>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setReviewState((prev) => ({ ...prev, decision: 'APPROVED' }))}
                          className={`rounded-2xl border p-3 text-center text-xs font-bold transition ${
                            reviewState.decision === 'APPROVED' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200' : 'border-slate-200 bg-slate-50 text-slate-700'
                          }`}
                        >
                          <ThumbsUp className="mx-auto mb-1 h-4 w-4 text-emerald-600" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewState((prev) => ({ ...prev, decision: 'REJECTED' }))}
                          className={`rounded-2xl border p-3 text-center text-xs font-bold transition ${
                            reviewState.decision === 'REJECTED' ? 'border-red-500 bg-red-50 text-red-700 ring-2 ring-red-200' : 'border-slate-200 bg-slate-50 text-slate-700'
                          }`}
                        >
                          <ThumbsDown className="mx-auto mb-1 h-4 w-4 text-red-600" />
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewState((prev) => ({ ...prev, decision: 'CLARIFICATION_REQUESTED' }))}
                          className={`rounded-2xl border p-3 text-center text-xs font-bold transition ${
                            reviewState.decision === 'CLARIFICATION_REQUESTED' ? 'border-amber-500 bg-amber-50 text-amber-700 ring-2 ring-amber-200' : 'border-slate-200 bg-slate-50 text-slate-700'
                          }`}
                        >
                          <Clock className="mx-auto mb-1 h-4 w-4 text-amber-600" />
                          Clarify
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Pharmacist Clinical Notes
                      </label>
                      <textarea
                        rows={4}
                        value={reviewState.reason}
                        onChange={(e) => setReviewState((prev) => ({ ...prev, reason: e.target.value }))}
                        className="mt-2 input-shell"
                        placeholder="Provide medical justification or dosage verification..."
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        disabled={reviewState.isSubmitting}
                        onClick={handleSubmitReview}
                        className="primary-button flex-1"
                      >
                        {reviewState.isSubmitting ? 'Submitting...' : 'Submit Decision'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelReview}
                        className="secondary-button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs text-slate-500">
                    No prescription currently selected for review.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TABS 2-6: ORDERS & PREPARATION WORKFLOW */}
      {activeTab !== 'reviews' && (
        <div className="mt-6 space-y-6">
          {/* Search Bar */}
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <Search className="h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by order ID, medication, customer name..."
              className="w-full text-sm outline-none placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          {loadingOrders ? (
            <div className="flex items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 p-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <Package className="mx-auto h-8 w-8 text-slate-400 mb-2" />
              <p className="font-bold text-slate-700">No orders found in this category.</p>
              <p className="mt-1 text-xs text-slate-500">Orders will appear here as customers place and pay for orders.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm space-y-4 hover:shadow-md transition"
                >
                  {/* Order Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Order</span>
                      <h3 className="text-lg font-black text-slate-900">{order.orderId}</h3>
                      <p className="text-xs font-semibold text-slate-500">{order.pharmacyName}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        order.status === 'PENDING_PREPARATION'
                          ? 'bg-amber-100 text-amber-700'
                          : order.status === 'PREPARING'
                          ? 'bg-indigo-100 text-indigo-700'
                          : order.status === 'READY_FOR_PICKUP'
                          ? 'bg-blue-100 text-blue-700'
                          : order.status === 'COLLECTED'
                          ? 'bg-teal-100 text-teal-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Medication Details */}
                  <div className="rounded-2xl bg-slate-50 p-3.5 space-y-1">
                    <p className="text-xs font-bold text-slate-900">{order.drugName}</p>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>Qty: {order.quantity} unit(s)</span>
                      <span className="font-bold text-emerald-700">GH₵ {order.totalPrice.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Customer Info */}
                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5 font-medium">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <span>{order.customerName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <a href={`tel:${order.customerPhone}`} className="text-blue-600 hover:underline">
                        {order.customerPhone}
                      </a>
                    </div>
                  </div>

                  {/* Workflow Action Buttons */}
                  <div className="pt-2 border-t border-slate-100">
                    {order.status === 'PENDING_PREPARATION' && (
                      <button
                        type="button"
                        disabled={orderActionLoading === order.id}
                        onClick={() => handlePrepareOrder(order)}
                        className="primary-button w-full bg-amber-600 hover:bg-amber-700 text-xs py-2.5 font-bold"
                      >
                        {orderActionLoading === order.id ? 'Processing...' : '📦 Prepare Order'}
                      </button>
                    )}

                    {order.status === 'PREPARING' && (
                      <button
                        type="button"
                        disabled={orderActionLoading === order.id}
                        onClick={() => handleMarkReadyForPickup(order)}
                        className="primary-button w-full bg-indigo-600 hover:bg-indigo-700 text-xs py-2.5 font-bold"
                      >
                        {orderActionLoading === order.id ? 'Processing...' : '✓ Mark Ready For Pickup'}
                      </button>
                    )}

                    {order.status === 'READY_FOR_PICKUP' && (
                      <button
                        type="button"
                        disabled={orderActionLoading === order.id}
                        onClick={() => handleConfirmDriverCollection(order)}
                        className="primary-button w-full bg-blue-600 hover:bg-blue-700 text-xs py-2.5 font-bold"
                      >
                        {orderActionLoading === order.id ? 'Processing...' : '🏍️ Confirm Driver Collection'}
                      </button>
                    )}

                    {order.status === 'COLLECTED' && (
                      <div className="flex items-center justify-center gap-2 rounded-2xl bg-teal-50 py-2.5 text-xs font-bold text-teal-700">
                        <Truck className="h-4 w-4" />
                        Driver Collected Package
                      </div>
                    )}

                    {['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(order.status) && (
                      <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 py-2.5 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        {order.status === 'IN_TRANSIT' ? 'In Transit to Customer' : 'Order Delivered'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default PharmacistReviewPage;
