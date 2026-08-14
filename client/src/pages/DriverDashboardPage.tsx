import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle, Clock, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getUser } from '../lib/auth';
import { getSupabaseClient } from '../lib/supabase';

interface Request {
  id: string;
  orderId: string;
  drug: string;
  pharmacy: string;
  distance: number;
  eta: number;
  earnings: number;
  status: 'AVAILABLE' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED';
}

interface DeliveryState {
  id: string;
  orderId: string;
  drug: string;
  currentStage: 'ASSIGNED' | 'COLLECTED' | 'IN_TRANSIT' | 'DELIVERED';
  distance: number;
  eta: number;
  pharmacy: string;
  patient: string;
  earnings: number;
}

interface ActivityStats {
  todayDeliveries: number;
  completedDeliveries: number;
  cancelledDeliveries: number;
  successRate: number;
}

interface HistoryItem {
  id: string;
  date: string;
  pharmacy: string;
  patient: string;
  amount: number;
  status: 'COMPLETED' | 'CANCELLED' | 'FAILED';
}

const DRIVER_TRACKING_STATES = ['REQUESTED', 'ASSIGNED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];

const DriverDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'requests' | 'active' | 'history'>('requests');
  const [requests, setRequests] = useState<Request[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<DeliveryState | null>(null);
  const [stats, setStats] = useState<ActivityStats>({
    todayDeliveries: 0,
    completedDeliveries: 0,
    cancelledDeliveries: 0,
    successRate: 0
  });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const client = getSupabaseClient();
      const currentUser = getUser();
      const authUser = currentUser?.id ? { data: { user: { id: currentUser.id } } } : await client.auth.getUser();
      const userId = authUser.data.user?.id;

      if (!userId) {
        throw new Error('Driver user is not authenticated.');
      }

      const { data: driverRow, error: driverError } = await client
        .from('Driver')
        .select('id')
        .eq('userId', userId)
        .maybeSingle();

      if (driverError) throw driverError;

      const [{ data: requestRows, error: requestError }, { data: activeRows, error: activeError }] = await Promise.all([
        client.from('DeliveryRequest').select('*').eq('status', 'REQUESTED').order('requestedAt', { ascending: false }),
        driverRow
          ? client.from('DeliveryRequest').select('*').eq('driverId', driverRow.id).in('status', DRIVER_TRACKING_STATES).order('updatedAt', { ascending: false })
          : Promise.resolve({ data: [], error: null })
      ]);

      if (requestError) throw requestError;
      if (activeError) throw activeError;

      const prescriptionIds = [...new Set((requestRows ?? []).map((row) => row.prescriptionId))];
      const prescriptions = prescriptionIds.length
        ? await client.from('Prescription').select('*').in('id', prescriptionIds)
        : { data: [], error: null };
      if (prescriptions.error) throw prescriptions.error;

      const drugIds = [...new Set((prescriptions.data ?? []).map((item) => item.drugId).filter(Boolean))];
      const drugs = drugIds.length
        ? await client.from('Drug').select('id, genericName, brandName').in('id', drugIds)
        : { data: [], error: null };
      if (drugs.error) throw drugs.error;

      const pharmacyIds = [...new Set((prescriptions.data ?? []).map((item) => item.pharmacyId).filter(Boolean))];
      const pharmacies = pharmacyIds.length
        ? await client.from('Pharmacy').select('id, name').in('id', pharmacyIds)
        : { data: [], error: null };
      if (pharmacies.error) throw pharmacies.error;

      const drugMap = new Map((drugs.data ?? []).map((item) => [item.id, item]));
      const pharmacyMap = new Map((pharmacies.data ?? []).map((item) => [item.id, item]));
      const prescriptionMap = new Map((prescriptions.data ?? []).map((item) => [item.id, item]));

      setRequests((requestRows ?? []).map((row) => {
        const prescription = prescriptionMap.get(row.prescriptionId);
        const drug = prescription?.drugId ? drugMap.get(prescription.drugId) : null;
        const pharmacy = prescription?.pharmacyId ? pharmacyMap.get(prescription.pharmacyId) : null;
        const distance = pharmacy ? Number((2.1 + Math.random() * 3.5).toFixed(1)) : 0;
        const eta = pharmacy ? Math.max(5, Math.round(distance * 3.1)) : 0;

        return {
          id: row.id,
          orderId: `ORD-${row.id.slice(0, 8).toUpperCase()}`,
          drug: drug ? `${drug.genericName}${drug.brandName ? ` (${drug.brandName})` : ''}` : 'Medication',
          pharmacy: pharmacy?.name ?? 'Pharmacy pending',
          distance,
          eta,
          earnings: Number((Number(prescription?.deliveryFee ?? 12.5) || 12.5).toFixed(2)),
          status: 'AVAILABLE'
        };
      }));

      const currentActive = (activeRows ?? []).find((row) => row.driverId === driverRow?.id && ['ASSIGNED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED'].includes(row.status));
      if (currentActive) {
        setActiveDelivery({
          id: currentActive.id,
          orderId: `ORD-${currentActive.id.slice(0, 8).toUpperCase()}`,
          drug: 'Medication order',
          currentStage: (currentActive.status as DeliveryState['currentStage']) || 'ASSIGNED',
          distance: 2.4,
          eta: 8,
          pharmacy: 'Pharmacy pending',
          patient: 'Patient location',
          earnings: 12.5
        });
      } else {
        setActiveDelivery(null);
      }

      const completedCount = (activeRows ?? []).filter((row) => row.status === 'DELIVERED' || row.status === 'COMPLETED').length;
      setStats({
        todayDeliveries: Math.max(0, (activeRows ?? []).length),
        completedDeliveries: completedCount,
        cancelledDeliveries: 0,
        successRate: completedCount > 0 ? 100 : 0
      });
      setHistory([]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the driver dashboard.');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboardData();

    const client = getSupabaseClient();
    const channel = client.channel('driver-dashboard-live');
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'DeliveryRequest' }, () => {
      void loadDashboardData();
    });
    void channel.subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  const handleAcceptRequest = async (request: Request) => {
    try {
      setError(null);
      const client = getSupabaseClient();
      const currentUser = getUser();
      const authUser = currentUser?.id ? { data: { user: { id: currentUser.id } } } : await client.auth.getUser();
      const userId = authUser.data.user?.id;
      if (!userId) throw new Error('Could not determine the current driver.');

      const { data: driverRow, error: driverError } = await client
        .from('Driver')
        .select('id')
        .eq('userId', userId)
        .maybeSingle();

      if (driverError) throw driverError;
      if (!driverRow) throw new Error('No driver profile is linked to this account.');

      const { error: updateError } = await client
        .from('DeliveryRequest')
        .update({
          driverId: driverRow.id,
          status: 'ASSIGNED',
          acceptedAt: new Date().toISOString()
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      setActiveDelivery({
        id: request.id,
        orderId: request.orderId,
        drug: request.drug,
        currentStage: 'ASSIGNED',
        distance: request.distance,
        eta: request.eta,
        pharmacy: request.pharmacy,
        patient: 'Patient location',
        earnings: request.earnings
      });
      setActiveTab('active');
      setRequests((prev) => prev.filter((item) => item.id !== request.id));
      navigate(`/driver-tracking/${request.id}`);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'Unable to accept the delivery request.');
    }
  };

  const handleRejectRequest = async (id: string) => {
    try {
      const client = getSupabaseClient();
      const { error } = await client.from('DeliveryRequest').update({ status: 'CANCELLED' }).eq('id', id);
      if (error) throw error;
      setRequests((prev) => prev.filter((item) => item.id !== id));
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : 'Unable to reject this request.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Driver Dashboard</h1>
        <p className="mt-1 text-slate-600">Track incoming requests and begin each delivery from the database.</p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-600">Today</p>
              <p className="text-2xl font-bold text-slate-900">{stats.todayDeliveries}</p>
            </div>
            <Clock className="h-8 w-8 text-blue-500 opacity-70" />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-600">Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats.completedDeliveries}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500 opacity-70" />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-600">Cancelled</p>
              <p className="text-2xl font-bold text-red-600">{stats.cancelledDeliveries}</p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-500 opacity-70" />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-600">Success</p>
              <p className="text-2xl font-bold text-slate-900">{stats.successRate.toFixed(1)}%</p>
            </div>
            <CheckCircle className="h-8 w-8 text-slate-400 opacity-70" />
          </div>
        </div>
      </div>

      <div className="mb-6 flex gap-2 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <button onClick={() => setActiveTab('requests')} className={`flex-1 rounded px-4 py-2 text-sm font-medium ${activeTab === 'requests' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
          Available Requests ({requests.length})
        </button>
        <button onClick={() => setActiveTab('active')} className={`flex-1 rounded px-4 py-2 text-sm font-medium ${activeTab === 'active' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
          Active Delivery {activeDelivery ? '●' : ''}
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex-1 rounded px-4 py-2 text-sm font-medium ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
          History
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="mt-3 text-slate-600">Loading delivery requests...</p>
        </div>
      ) : activeTab === 'requests' ? (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
              <p className="text-slate-600">No available requests right now.</p>
              <p className="mt-2 text-sm text-slate-500">Check back after a new patient places an order.</p>
            </div>
          ) : (
            requests.map((request) => (
              <div key={request.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex-1">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-1 h-4 w-4 flex-shrink-0 text-blue-600" />
                      <div>
                        <p className="font-semibold text-slate-900">{request.drug}</p>
                        <p className="text-sm text-slate-600">{request.pharmacy}</p>
                      </div>
                    </div>

                    <div className="ml-6 mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.1em] text-slate-500">Distance</p>
                        <p className="font-semibold text-slate-900">{request.distance} km</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.1em] text-slate-500">ETA</p>
                        <p className="font-semibold text-slate-900">{request.eta} min</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.1em] text-slate-500">Earnings</p>
                        <p className="font-semibold text-emerald-600">GH₵ {request.earnings.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 md:flex-col md:items-end">
                    <button onClick={() => handleAcceptRequest(request)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">
                      Accept Request
                    </button>
                    <button onClick={() => handleRejectRequest(request.id)} className="text-sm font-medium text-red-600 hover:text-red-700">
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : activeTab === 'active' ? (
        activeDelivery ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Active delivery</p>
                <h2 className="text-2xl font-bold text-slate-900">{activeDelivery.orderId}</h2>
              </div>
              <button onClick={() => navigate(`/driver-tracking/${activeDelivery.id}`)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-medium text-white transition hover:bg-emerald-700">
                Open Tracking <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Drug</p>
                <p className="mt-1 font-semibold text-slate-900">{activeDelivery.drug}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Pharmacy</p>
                <p className="mt-1 font-semibold text-slate-900">{activeDelivery.pharmacy}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Patient</p>
                <p className="mt-1 font-semibold text-slate-900">{activeDelivery.patient}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Distance</p>
                <p className="mt-1 font-semibold text-slate-900">{activeDelivery.distance} km</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-slate-500">ETA</p>
                <p className="mt-1 font-semibold text-slate-900">{activeDelivery.eta} min</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Stage</p>
                <p className="mt-1 font-semibold text-slate-900">{activeDelivery.currentStage}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Earnings</p>
                <p className="mt-1 font-semibold text-emerald-600">GH₵ {activeDelivery.earnings.toFixed(2)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-slate-600">No active delivery yet.</p>
            <p className="mt-2 text-sm text-slate-500">Accept a request to begin the route.</p>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
              <p className="text-slate-600">No delivery history available yet.</p>
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{item.pharmacy}</p>
                    <p className="text-sm text-slate-600">{item.patient}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm text-slate-500">{item.date}</p>
                    <p className="font-semibold text-emerald-600">GH₵ {item.amount.toFixed(2)}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : item.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {item.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default DriverDashboardPage;
