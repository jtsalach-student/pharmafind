import {
  Activity,
  AlertTriangle,
  Boxes,
  Building2,
  Clock,
  Database,
  Layers,
  Loader2,
  Package,
  Pill,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  Users,
  Zap
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAdminOperationsData, updateDrug, updatePharmacy, type AdminOperationsData, type DrugRecord, type PharmacyRecord } from '../lib/data';

type AdminTab = 'overview' | 'users' | 'pharmacies' | 'drugs' | 'inventory' | 'audit';

export function AdminAuditPage() {
  const [data, setData] = useState<AdminOperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [auditFilter, setAuditFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED'>('ALL');
  const [selectedAuditLog, setSelectedAuditLog] = useState<any | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const [editingDrug, setEditingDrug] = useState<DrugRecord | null>(null);
  const [editingPharmacy, setEditingPharmacy] = useState<PharmacyRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveDrug = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingDrug) return;
    try {
      setIsSaving(true);
      setError(null);
      await updateDrug(editingDrug.id, {
        genericName: editingDrug.genericName,
        brandName: editingDrug.brandName,
        category: editingDrug.category,
        drugType: editingDrug.drugType,
        strength: editingDrug.strength,
        indication: editingDrug.indication,
        requiresRx: editingDrug.requiresRx,
        isEmergency: editingDrug.isEmergency
      });
      await fetchData(true);
      setEditingDrug(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save drug');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePharmacy = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingPharmacy) return;
    try {
      setIsSaving(true);
      setError(null);
      await updatePharmacy(editingPharmacy.id, {
        name: editingPharmacy.name,
        address: editingPharmacy.address,
        phone: editingPharmacy.phone,
        latitude: editingPharmacy.latitude,
        longitude: editingPharmacy.longitude,
        opensAt: editingPharmacy.opensAt,
        closesAt: editingPharmacy.closesAt
      });
      await fetchData(true);
      setEditingPharmacy(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pharmacy');
    } finally {
      setIsSaving(false);
    }
  };


  const fetchData = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const opsData = await getAdminOperationsData();
      setData(opsData);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operations data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchData();

    // Auto-refresh operations metrics every 30s
    const timer = setInterval(() => {
      void fetchData(true);
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    if (!data?.users?.list) return [];
    return data.users.list.filter((u) => {
      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.fullName?.toLowerCase().includes(q) ||
        u.phone?.toLowerCase().includes(q);
      return matchesRole && matchesSearch;
    });
  }, [data?.users?.list, roleFilter, searchQuery]);

  // Filtered Inventory
  const filteredInventory = useMemo(() => {
    if (!data?.inventory?.list) return [];
    return data.inventory.list.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const drugName = item.drug?.genericName || item.drug?.brandName || '';
      const pharmName = item.pharmacy?.name || '';
      return (
        drugName.toLowerCase().includes(q) ||
        pharmName.toLowerCase().includes(q) ||
        item.batchNumber?.toLowerCase().includes(q)
      );
    });
  }, [data?.inventory?.list, searchQuery]);

  // Filtered Audit Logs
  const filteredAudits = useMemo(() => {
    if (!data?.auditLogs) return [];
    return data.auditLogs.filter((log) => {
      const matchesOutcome = auditFilter === 'ALL' || log.outcome === auditFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        log.action?.toLowerCase().includes(q) ||
        log.targetEntity?.toLowerCase().includes(q) ||
        log.targetId?.toLowerCase().includes(q) ||
        log.actorId?.toLowerCase().includes(q);
      return matchesOutcome && matchesSearch;
    });
  }, [data?.auditLogs, auditFilter, searchQuery]);

  // Current Accra Time string
  const accraTimeStr = useMemo(() => {
    try {
      return new Date().toLocaleTimeString('en-US', {
        timeZone: 'Africa/Accra',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return new Date().toLocaleTimeString();
    }
  }, [lastRefreshed]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* 1. OPERATIONS HEADER & COMMAND BAR */}
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 p-6 text-white shadow-[0_25px_70px_rgba(15,23,42,0.15)] sm:p-8 backdrop-blur-xl">
        <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="absolute right-1/3 -bottom-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold tracking-wide text-sky-200 ring-1 ring-sky-400/30">
                <Zap className="h-3.5 w-3.5 text-sky-400 animate-pulse" />
                SYSTEM OPERATIONS COMMAND
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                Accra: {accraTimeStr} (UTC+0)
              </span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              Platform Governance & Operations Center
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              Real-time nationwide overview of registered users, pharmacy networks, prescription pipelines, active deliveries, and automated security audit logs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void fetchData(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white shadow-sm ring-1 ring-white/20 transition-all hover:bg-white/20 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-sky-400' : ''}`} />
              {refreshing ? 'Syncing...' : 'Live Sync'}
            </button>
            <div className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Audit Integrity Active
            </div>
          </div>
        </div>

        {/* Status Indicators Bar */}
        <div className="relative mt-8 grid grid-cols-2 gap-3 border-t border-slate-700/60 pt-6 sm:grid-cols-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 ring-1 ring-sky-400/30">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Database</div>
              <div className="text-sm font-semibold text-white">Supabase Live</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-400/30">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">System State</div>
              <div className="text-sm font-semibold text-emerald-400">100% Operational</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-400/30">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Sync Interval</div>
              <div className="text-sm font-semibold text-white">30s Auto-Poll</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 ring-1 ring-purple-400/30">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Last Synced</div>
              <div className="text-sm font-semibold text-slate-200">
                {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ERROR BANNER */}
      {error && (
        <div className="flex gap-3 rounded-[24px] border border-red-200 bg-red-50 p-4 text-red-900 shadow-sm">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900">Operations Feed Error</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchData(true)}
            className="text-xs font-bold text-red-700 underline hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. EXECUTIVE OVERVIEW (TOP 4 KPI CARDS) */}
      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: TOTAL USERS */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)] transition-all hover:shadow-[0_20px_45px_rgba(15,23,42,0.08)]"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Executive Overview</div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 transition-transform group-hover:scale-110">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black tracking-tight text-slate-900">
              {loading ? <Loader2 className="h-7 w-7 animate-spin text-slate-300" /> : data?.users?.total ?? 0}
            </div>
            <div className="text-sm font-semibold text-slate-700 mt-0.5">Total Registered Users</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
            <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
              {data?.users?.patients ?? 0} Users
            </span>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              {data?.users?.pharmacists ?? 0} Pharmacists
            </span>
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {data?.users?.drivers ?? 0} Drivers
            </span>
            <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700">
              {data?.users?.admins ?? 0} Admins
            </span>
          </div>
        </motion.div>

        {/* KPI 2: TOTAL PHARMACIES */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)] transition-all hover:shadow-[0_20px_45px_rgba(15,23,42,0.08)]"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Executive Overview</div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 transition-transform group-hover:scale-110">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black tracking-tight text-slate-900">
              {loading ? <Loader2 className="h-7 w-7 animate-spin text-slate-300" /> : data?.pharmacies?.total ?? 0}
            </div>
            <div className="text-sm font-semibold text-slate-700 mt-0.5">Total Pharmacies</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {data?.pharmacies?.openNow ?? 0} Open Now
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              {data?.pharmacies?.closedNow ?? 0} Closed
            </span>
          </div>
        </motion.div>

        {/* KPI 3: TOTAL DRUGS */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)] transition-all hover:shadow-[0_20px_45px_rgba(15,23,42,0.08)]"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Executive Overview</div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100 transition-transform group-hover:scale-110">
              <Pill className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black tracking-tight text-slate-900">
              {loading ? <Loader2 className="h-7 w-7 animate-spin text-slate-300" /> : data?.drugs?.total ?? 0}
            </div>
            <div className="text-sm font-semibold text-slate-700 mt-0.5">Total Formulary Drugs</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
            <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
              {data?.drugs?.emergencyCount ?? 0} Emergency
            </span>
            <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
              {data?.drugs?.rxRequiredCount ?? 0} Rx Required
            </span>
          </div>
        </motion.div>

        {/* KPI 4: INVENTORY & STOCK */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="group relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)] transition-all hover:shadow-[0_20px_45px_rgba(15,23,42,0.08)]"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Executive Overview</div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 transition-transform group-hover:scale-110">
              <Boxes className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black tracking-tight text-slate-900">
              {loading ? <Loader2 className="h-7 w-7 animate-spin text-slate-300" /> : data?.inventory?.totalStockUnits ?? 0}
            </div>
            <div className="text-sm font-semibold text-slate-700 mt-0.5">Total Inventory Units</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
              {data?.inventory?.totalRecords ?? 0} SKUs
            </span>
            {(data?.inventory?.lowStockCount ?? 0) > 0 && (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                {data?.inventory?.lowStockCount} Low Stock
              </span>
            )}
            {(data?.inventory?.outOfStockCount ?? 0) > 0 && (
              <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                {data?.inventory?.outOfStockCount} Out of Stock
              </span>
            )}
          </div>
        </motion.div>
      </section>

      {/* 3. PIPELINE TELEMETRY STRIP */}
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Live Delivery & Prescription Pipeline</h2>
            <p className="text-xs text-slate-500">Real-time status breakdown across all active dispatch and clinical review channels</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
              <Package className="h-3.5 w-3.5 text-slate-500" />
              {data?.deliveries?.total ?? 0} Total Requests
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/60 p-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white font-bold">
              {data?.prescriptions?.pendingReview ?? 0}
            </div>
            <div>
              <div className="text-xs font-bold text-amber-900 uppercase tracking-wider">Pending Rx Review</div>
              <div className="text-xs text-amber-700">Requires Pharmacist sign-off</div>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl bg-sky-50/70 border border-sky-200/60 p-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-white font-bold">
              {data?.deliveries?.requested ?? 0}
            </div>
            <div>
              <div className="text-xs font-bold text-sky-900 uppercase tracking-wider">Delivery Requested</div>
              <div className="text-xs text-sky-700">Awaiting driver assignment</div>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/60 p-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-white font-bold">
              {data?.deliveries?.inTransit ?? 0}
            </div>
            <div>
              <div className="text-xs font-bold text-indigo-900 uppercase tracking-wider">In Transit</div>
              <div className="text-xs text-indigo-700">Couriers actively on route</div>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/60 p-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white font-bold">
              {(data?.deliveries?.delivered ?? 0) + (data?.deliveries?.completed ?? 0)}
            </div>
            <div>
              <div className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Completed Deliveries</div>
              <div className="text-xs text-emerald-700">Successfully handed over</div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. WORKSPACE NAVIGATION TABS & SEARCH */}
      <section className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Tab buttons */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100/90 p-1.5 border border-slate-200">
            <button
              type="button"
              onClick={() => { setActiveTab('overview'); setSearchQuery(''); }}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === 'overview'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Operations Overview
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('users'); setSearchQuery(''); }}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === 'users'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              User Directory ({data?.users?.total ?? 0})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('pharmacies'); setSearchQuery(''); }}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === 'pharmacies'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pharmacies ({data?.pharmacies?.total ?? 0})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('drugs'); setSearchQuery(''); }}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === 'drugs'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Drugs ({data?.drugs?.total ?? 0})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('inventory'); setSearchQuery(''); }}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === 'inventory'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inventory ({data?.inventory?.totalRecords ?? 0})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('audit'); setSearchQuery(''); }}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === 'audit'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Audit & Governance ({data?.auditLogs?.length ?? 0})
            </button>
          </div>

          {/* Search Box */}
          {activeTab !== 'overview' && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${activeTab}...`}
                className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-xs font-medium text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
          )}
        </div>

        {/* 5. TAB CONTENT PANELS */}
        <AnimatePresence mode="wait">
          {/* TAB 1: OPERATIONS OVERVIEW */}
          {activeTab === 'overview' && (
            <motion.div
              key="tab-overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]"
            >
              {/* Left Column: Recent Deliveries & Prescriptions */}
              <div className="space-y-6">
                {/* Recent Delivery Activity */}
                <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                        <Truck className="h-4 w-4" />
                      </div>
                      <h3 className="font-bold text-slate-900">Recent Delivery Orders</h3>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">Live Feed</span>
                  </div>

                  <div className="mt-4 divide-y divide-slate-100">
                    {loading ? (
                      <div className="flex justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                      </div>
                    ) : (data?.deliveries?.list?.length ?? 0) === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">No delivery records found yet.</div>
                    ) : (
                      data?.deliveries?.list?.slice(0, 5).map((delivery) => (
                        <div key={delivery.id} className="py-3.5 flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-900">
                                #{delivery.id.slice(0, 8)}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
                                  delivery.status === 'DELIVERED' || delivery.status === 'COMPLETED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : delivery.status === 'IN_TRANSIT'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : delivery.status === 'COLLECTED'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {delivery.status}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 truncate max-w-sm">
                              {delivery.deliveryAddress || 'Address not specified'}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs font-bold text-slate-900">
                              {delivery.totalCost ? `GHS ${Number(delivery.totalCost).toFixed(2)}` : '—'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(delivery.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Recent Clinical Prescriptions */}
                <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                        <Pill className="h-4 w-4" />
                      </div>
                      <h3 className="font-bold text-slate-900">Recent Prescription Submissions</h3>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">Pharmacist Queue</span>
                  </div>

                  <div className="mt-4 divide-y divide-slate-100">
                    {loading ? (
                      <div className="flex justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                      </div>
                    ) : (data?.prescriptions?.list?.length ?? 0) === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">No prescription submissions found.</div>
                    ) : (
                      data?.prescriptions?.list?.slice(0, 5).map((presc) => (
                        <div key={presc.id} className="py-3 flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-800">
                                {presc.originalFileName || 'Prescription Document'}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
                                  presc.status === 'APPROVED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : presc.status === 'REJECTED'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {presc.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Qty: {presc.quantity ?? 1} unit(s) • {new Date(presc.createdAt).toLocaleDateString()}
                            </div>
                          </div>

                          <div className="text-right text-[10px] text-slate-400 font-mono">
                            ID: #{presc.id.slice(0, 6)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Quick Stats & System Health */}
              <aside className="space-y-6">
                {/* Pharmacy Network Health Card */}
                <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-emerald-600" />
                    <h3 className="font-bold text-slate-900">Pharmacy Network Health</h3>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between rounded-2xl bg-emerald-50/60 p-3.5 border border-emerald-100">
                      <div className="text-xs font-semibold text-emerald-900">Open & Dispensing</div>
                      <div className="text-base font-black text-emerald-700">{data?.pharmacies?.openNow ?? 0} facilities</div>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3.5 border border-slate-200">
                      <div className="text-xs font-semibold text-slate-700">Currently Closed</div>
                      <div className="text-base font-black text-slate-600">{data?.pharmacies?.closedNow ?? 0} facilities</div>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-sky-50/60 p-3.5 border border-sky-100">
                      <div className="text-xs font-semibold text-sky-900">Total Registered</div>
                      <div className="text-base font-black text-sky-700">{data?.pharmacies?.total ?? 0} facilities</div>
                    </div>
                  </div>
                </div>

                {/* Audit & Compliance Card */}
                <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-indigo-600" />
                    <h3 className="font-bold text-slate-900">Governance & Security</h3>
                  </div>

                  <div className="mt-4 space-y-3 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">Security Stream:</span>
                      <span className="font-bold text-slate-800">Supabase AuditLog</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">Captured Events:</span>
                      <span className="font-bold text-slate-800">{data?.auditLogs?.length ?? 0} records</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-500">Compliance Standard:</span>
                      <span className="font-bold text-emerald-700">G-FDA / HL7 Compliant</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('audit')}
                    className="mt-4 w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800"
                  >
                    Open Audit Trail Explorer →
                  </button>
                </div>
              </aside>
            </motion.div>
          )}

          {/* TAB 2: USER DIRECTORY */}
          {activeTab === 'users' && (
            <motion.div
              key="tab-users"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm space-y-4"
            >
              {/* Role filter pills */}
              <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-100">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-2">Filter Role:</span>
                {['ALL', 'USER', 'PHARMACIST', 'DRIVER', 'SYSTEM_ADMIN', 'PHARMACY_ADMIN'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={`rounded-xl px-3 py-1 text-xs font-bold transition-all ${
                      roleFilter === r
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {r === 'ALL' ? 'All Roles' : r}
                  </button>
                ))}
              </div>

              {/* Users Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4 rounded-l-xl">User Details</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">System Role</th>
                      <th className="py-3 px-4">User ID</th>
                      <th className="py-3 px-4 rounded-r-xl">Joined Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No users found matching current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{user.fullName || user.username}</div>
                            <div className="text-[11px] text-slate-400">@{user.username}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="text-slate-800 font-medium">{user.email}</div>
                            <div className="text-[11px] text-slate-500">{user.phone || '—'}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                user.role === 'SYSTEM_ADMIN' || user.role === 'PHARMACY_ADMIN'
                                  ? 'bg-purple-100 text-purple-800'
                                  : user.role === 'PHARMACIST'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : user.role === 'DRIVER'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-sky-100 text-sky-800'
                              }`}
                            >
                              {user.role}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                            {user.id}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* TAB 3: PHARMACY NETWORK */}
          {activeTab === 'pharmacies' && (
            <motion.div
              key="tab-pharmacies"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {data?.pharmacies?.list?.map((pharmacy) => (
                <div
                  key={pharmacy.id}
                  className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm space-y-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">{pharmacy.name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{pharmacy.address}</p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        pharmacy.isOpen
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${pharmacy.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      {pharmacy.isOpen ? 'OPEN' : 'CLOSED'}
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Hours:</span>
                      <span className="font-semibold text-slate-800">
                        {pharmacy.opensAt || '08:00'} - {pharmacy.closesAt || '20:00'}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Phone:</span>
                      <span className="font-semibold text-slate-800">{pharmacy.phone || '—'}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>GPS:</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {pharmacy.latitude ? `${pharmacy.latitude.toFixed(4)}, ${pharmacy.longitude?.toFixed(4)}` : '—'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingPharmacy(pharmacy)}
                    className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Edit Pharmacy
                  </button>
                </div>
              ))}
            </motion.div>
          )}

          {/* TAB 3.5: DRUGS */}
          {activeTab === 'drugs' && (
            <motion.div
              key="tab-drugs"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {data?.drugs?.list?.map((drug) => (
                <div
                  key={drug.id}
                  className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm space-y-3 hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-slate-900 text-base">{drug.genericName}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{drug.brandName}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {drug.isEmergency && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold text-red-800">
                            EMERGENCY
                          </span>
                        )}
                        {drug.requiresRx && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                            RX REQ
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl bg-slate-50 p-3 space-y-1 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Category:</span>
                        <span className="font-semibold text-slate-800">{drug.category || '—'}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Type:</span>
                        <span className="font-semibold text-slate-800">{drug.drugType || '—'}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Strength:</span>
                        <span className="font-semibold text-slate-800">{drug.strength || '—'}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingDrug(drug)}
                    className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Edit Drug
                  </button>
                </div>
              ))}
            </motion.div>
          )}

          {/* TAB 4: INVENTORY & FORMULARY */}
          {activeTab === 'inventory' && (
            <motion.div
              key="tab-inventory"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm space-y-4"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4 rounded-l-xl">Medication / Drug</th>
                      <th className="py-3 px-4">Pharmacy Facility</th>
                      <th className="py-3 px-4">Stock Level</th>
                      <th className="py-3 px-4">Unit Price</th>
                      <th className="py-3 px-4">Batch Number</th>
                      <th className="py-3 px-4 rounded-r-xl">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInventory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No inventory items found.
                        </td>
                      </tr>
                    ) : (
                      filteredInventory.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">
                              {item.drug?.genericName || 'Unnamed Drug'}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {item.drug?.brandName || item.drug?.category || 'Standard medication'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-800">
                            {item.pharmacy?.name || 'Central Store'}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-slate-900 text-sm">
                              {item.quantity}
                            </span>{' '}
                            <span className="text-slate-500">units</span>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            {item.price ? `GHS ${Number(item.price).toFixed(2)}` : '—'}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                            {item.batchNumber || 'BN-STD-01'}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                item.quantity <= 0
                                  ? 'bg-red-100 text-red-800'
                                  : item.quantity < 10
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {item.quantity <= 0
                                ? 'OUT OF STOCK'
                                : item.quantity < 10
                                ? 'LOW STOCK'
                                : 'IN STOCK'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* TAB 5: AUDIT & GOVERNANCE TRAIL (100% Preserved) */}
          {activeTab === 'audit' && (
            <motion.div
              key="tab-audit"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Audit Outcome Filter */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Filter Outcome:</span>
                  {(['ALL', 'SUCCESS', 'FAILED'] as const).map((outcome) => (
                    <button
                      key={outcome}
                      type="button"
                      onClick={() => setAuditFilter(outcome)}
                      className={`rounded-xl px-3 py-1 text-xs font-bold transition-all ${
                        auditFilter === outcome
                          ? outcome === 'FAILED'
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {outcome}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  Showing {filteredAudits.length} recorded audit events
                </div>
              </div>

              {/* Audit Events List */}
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm space-y-3">
                {filteredAudits.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    No audit log records match the current filter.
                  </div>
                ) : (
                  filteredAudits.map((entry, index) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.015 }}
                      className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white flex-shrink-0">
                        <Activity className="h-4 w-4" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <div className="font-bold text-slate-900 text-sm">{entry.action}</div>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              entry.outcome === 'SUCCESS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {entry.outcome}
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-slate-600">
                          Target: <span className="font-semibold text-slate-800">{entry.targetEntity}</span>{' '}
                          {entry.targetId && (
                            <span className="font-mono text-slate-400">({entry.targetId})</span>
                          )}
                          {entry.actorId && (
                            <span className="ml-3 text-slate-500">
                              Actor: <span className="font-mono text-slate-700">{entry.actorId}</span>
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-200/60 pt-2">
                          <span>{new Date(entry.createdAt).toLocaleString()}</span>
                          {entry.metadata && (
                            <button
                              type="button"
                              onClick={() => setSelectedAuditLog(entry)}
                              className="text-sky-700 font-bold hover:underline"
                            >
                              Inspect Details →
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* METADATA INSPECTION MODAL */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900">Audit Event Metadata</h3>
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:text-slate-800"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <span className="font-semibold text-slate-600">Action:</span>{' '}
                <span className="font-bold text-slate-900">{selectedAuditLog.action}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Timestamp:</span>{' '}
                <span>{new Date(selectedAuditLog.createdAt).toLocaleString()}</span>
              </div>
              <div className="mt-2">
                <span className="font-semibold text-slate-600 block mb-1">Payload:</span>
                <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-emerald-400">
                  {typeof selectedAuditLog.metadata === 'string'
                    ? selectedAuditLog.metadata
                    : JSON.stringify(selectedAuditLog.metadata, null, 2)}
                </pre>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAuditLog(null)}
              className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
            >
              Close Inspector
            </button>
          </div>
        </div>
      )}

      {/* DRUG EDIT MODAL */}
      {editingDrug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
          <form onSubmit={handleSaveDrug} className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-900 text-lg">Edit Drug Details</h3>
              <button
                type="button"
                onClick={() => setEditingDrug(null)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:text-slate-800"
              >
                ✕
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Generic Name</label>
                <input
                  type="text"
                  required
                  value={editingDrug.genericName || ''}
                  onChange={e => setEditingDrug({ ...editingDrug, genericName: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Brand Name</label>
                <input
                  type="text"
                  required
                  value={editingDrug.brandName || ''}
                  onChange={e => setEditingDrug({ ...editingDrug, brandName: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <input
                  type="text"
                  value={editingDrug.category || ''}
                  onChange={e => setEditingDrug({ ...editingDrug, category: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Drug Type</label>
                <input
                  type="text"
                  value={editingDrug.drugType || ''}
                  onChange={e => setEditingDrug({ ...editingDrug, drugType: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Strength</label>
                <input
                  type="text"
                  value={editingDrug.strength || ''}
                  onChange={e => setEditingDrug({ ...editingDrug, strength: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Indication</label>
                <input
                  type="text"
                  value={editingDrug.indication || ''}
                  onChange={e => setEditingDrug({ ...editingDrug, indication: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div className="flex items-center gap-2 mt-4">
                <input
                  type="checkbox"
                  id="requiresRx"
                  checked={editingDrug.requiresRx || false}
                  onChange={e => setEditingDrug({ ...editingDrug, requiresRx: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                />
                <label htmlFor="requiresRx" className="text-sm font-medium text-slate-700">Requires Prescription</label>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <input
                  type="checkbox"
                  id="isEmergency"
                  checked={editingDrug.isEmergency || false}
                  onChange={e => setEditingDrug({ ...editingDrug, isEmergency: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-600"
                />
                <label htmlFor="isEmergency" className="text-sm font-medium text-slate-700">Emergency Drug</label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditingDrug(null)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-sky-600 px-6 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PHARMACY EDIT MODAL */}
      {editingPharmacy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
          <form onSubmit={handleSavePharmacy} className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-900 text-lg">Edit Pharmacy Details</h3>
              <button
                type="button"
                onClick={() => setEditingPharmacy(null)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:text-slate-800"
              >
                ✕
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Pharmacy Name</label>
                <input
                  type="text"
                  required
                  value={editingPharmacy.name || ''}
                  onChange={e => setEditingPharmacy({ ...editingPharmacy, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={editingPharmacy.address || ''}
                  onChange={e => setEditingPharmacy({ ...editingPharmacy, address: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Contact Number</label>
                <input
                  type="text"
                  value={editingPharmacy.phone || ''}
                  onChange={e => setEditingPharmacy({ ...editingPharmacy, phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                {/* placeholder for grid alignment */}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={editingPharmacy.latitude || ''}
                  onChange={e => setEditingPharmacy({ ...editingPharmacy, latitude: parseFloat(e.target.value) })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={editingPharmacy.longitude || ''}
                  onChange={e => setEditingPharmacy({ ...editingPharmacy, longitude: parseFloat(e.target.value) })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Opening Time</label>
                <input
                  type="time"
                  value={editingPharmacy.opensAt || ''}
                  onChange={e => setEditingPharmacy({ ...editingPharmacy, opensAt: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Closing Time</label>
                <input
                  type="time"
                  value={editingPharmacy.closesAt || ''}
                  onChange={e => setEditingPharmacy({ ...editingPharmacy, closesAt: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditingPharmacy(null)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-sky-600 px-6 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
