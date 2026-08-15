import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Package,
  PackageCheck,
  RefreshCw,
  Search,
  Stethoscope,
  Truck,
  UserCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getUser } from '../lib/auth';
import { getSupabaseClient } from '../lib/supabase';
import {
  fetchUserNotifications,
  getNotificationMeta,
  formatTimeAgo,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type AppNotification
} from '../lib/notifications';

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const user = getUser();
  const userId = user?.id;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'prescriptions' | 'orders' | 'deliveries'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const list = await fetchUserNotifications(userId);
      setNotifications(list);
    } catch (err) {
      console.warn('Error loading notifications page:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) return;

    void loadData();

    // Subscribe to realtime Supabase changes
    const client = getSupabaseClient();
    const channel = client.channel(`notifications-page-${userId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'Notification', filter: `userId=eq.${userId}` },
      () => {
        void loadData();
      }
    );
    void channel.subscribe();

    const interval = setInterval(() => {
      void loadData();
    }, 4000);

    return () => {
      clearInterval(interval);
      client.removeChannel(channel);
    };
  }, [userId]);

  const handleMarkOne = async (n: AppNotification) => {
    if (!userId) return;
    if (!n.isRead) {
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
      );
      await markNotificationAsRead(userId, n.id);
    }

    // Contextual navigation
    const typeUpper = (n.type || '').toUpperCase();
    if (typeUpper.includes('PRESCRIPTION')) {
      if (user?.role === 'PHARMACIST') {
        navigate('/pharmacist');
      } else {
        navigate('/dashboard');
      }
    } else if (typeUpper.includes('DELIVERY') || typeUpper.includes('DRIVER') || typeUpper.includes('ORDER')) {
      if (user?.role === 'DRIVER') {
        navigate('/driver-dashboard');
      } else if (user?.role === 'PHARMACIST') {
        navigate('/pharmacist');
      } else {
        navigate('/deliveries/track');
      }
    }
  };

  const handleMarkAll = async () => {
    if (!userId) return;
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    await markAllNotificationsAsRead(userId, unreadIds);
    setActionSuccess('All notifications marked as read.');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const filteredNotifications = notifications.filter((n) => {
    const typeUpper = (n.type || '').toUpperCase();

    // Tab filter
    if (filterTab === 'unread' && n.isRead) return false;
    if (filterTab === 'prescriptions' && !typeUpper.includes('PRESCRIPTION')) return false;
    if (filterTab === 'orders' && !typeUpper.includes('ORDER') && !typeUpper.includes('PAYMENT')) return false;
    if (filterTab === 'deliveries' && !typeUpper.includes('DELIVERY') && !typeUpper.includes('DRIVER')) return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const meta = getNotificationMeta(n.type);
      return (
        n.message.toLowerCase().includes(q) ||
        meta.title.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q)
      );
    }

    return true;
  });

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'prescription':
        return <Stethoscope className="h-5 w-5 text-sky-600" />;
      case 'order':
        return <Package className="h-5 w-5 text-indigo-600" />;
      case 'delivery':
        return <Truck className="h-5 w-5 text-emerald-600" />;
      case 'driver':
        return <PackageCheck className="h-5 w-5 text-amber-600" />;
      case 'user':
        return <UserCheck className="h-5 w-5 text-teal-600" />;
      default:
        return <Bell className="h-5 w-5 text-slate-600" />;
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
              <Bell className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Activity Center</div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Notifications & Updates</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-sky-700 transition"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all as read ({unreadCount})
              </button>
            )}
            <button
              type="button"
              onClick={loadData}
              className="rounded-2xl border border-slate-200 bg-white p-2.5 text-slate-700 hover:bg-slate-50 shadow-sm"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {actionSuccess && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
        )}
      </section>

      {/* Controls: Filter Tabs & Search */}
      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
              filterTab === 'all' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('unread')}
            className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
              filterTab === 'unread' ? 'bg-red-600 text-white shadow-md shadow-red-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Unread ({unreadCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('prescriptions')}
            className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
              filterTab === 'prescriptions' ? 'bg-sky-600 text-white shadow-md shadow-sky-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Prescriptions
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('orders')}
            className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
              filterTab === 'orders' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('deliveries')}
            className={`rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
              filterTab === 'deliveries' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Deliveries
          </button>
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search updates..."
            className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-xs font-medium text-slate-800 outline-none shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
          />
        </div>
      </div>

      {/* Notifications List */}
      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center rounded-[28px] border border-slate-200 bg-white p-12 shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
            <Bell className="mx-auto h-8 w-8 text-slate-300 mb-2" />
            <p className="font-bold text-slate-700">No notifications found</p>
            <p className="mt-1 text-xs text-slate-500">Your recent updates will appear here in real time.</p>
          </div>
        ) : (
          filteredNotifications.map((n) => {
            const meta = getNotificationMeta(n.type);
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => handleMarkOne(n)}
                className={`group cursor-pointer rounded-[24px] border p-5 transition shadow-sm hover:shadow-md flex items-start gap-4 ${
                  n.isRead ? 'border-slate-200 bg-white hover:border-slate-300' : 'border-sky-300 bg-sky-50/50 hover:bg-sky-50/80 ring-1 ring-sky-200'
                }`}
              >
                <div className="mt-0.5 rounded-2xl bg-white p-3 border border-slate-200/80 shadow-xs flex-shrink-0">
                  {getIcon(meta.iconType)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-slate-900">{meta.title}</h3>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.badgeColor}`}>
                        {n.type.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTimeAgo(n.createdAt)}
                      </span>
                      {!n.isRead && (
                        <span className="h-2.5 w-2.5 rounded-full bg-sky-500 shadow-sm shadow-sky-200" title="Unread" />
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-sm text-slate-700 leading-relaxed font-normal">
                    {n.message}
                  </p>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-2">
                    <span>Status: {n.isRead ? 'Read' : 'Unread'}</span>
                    <span className="text-sky-600 font-bold group-hover:underline flex items-center gap-1">
                      View details <ExternalLink className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </main>
  );
};

export default NotificationsPage;
