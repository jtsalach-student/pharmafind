import React, { useEffect, useState, useRef } from 'react';
import {
  Bell,
  Check,
  Clock,
  ExternalLink,
  Package,
  PackageCheck,
  Stethoscope,
  Truck,
  UserCheck,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const user = getUser();
  const userId = user?.id;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    if (!userId) return;
    try {
      const list = await fetchUserNotifications(userId);
      setNotifications(list);
    } catch (err) {
      console.warn('Failed to load notifications in bell:', err);
    }
  };

  useEffect(() => {
    if (!userId) return;

    void loadNotifications();

    // Subscribe to realtime Supabase changes on Notification table
    const client = getSupabaseClient();
    const channel = client.channel(`user-notifications-${userId}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'Notification', filter: `userId=eq.${userId}` },
      () => {
        void loadNotifications();
      }
    );
    void channel.subscribe();

    // Background polling fallback every 4 seconds
    const interval = setInterval(() => {
      void loadNotifications();
    }, 4000);

    return () => {
      clearInterval(interval);
      client.removeChannel(channel);
    };
  }, [userId]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

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
    setIsOpen(false);
  };

  const handleMarkAll = async () => {
    if (!userId) return;
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    await markAllNotificationsAsRead(userId, unreadIds);
  };

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'prescription':
        return <Stethoscope className="h-4 w-4 text-sky-600" />;
      case 'order':
        return <Package className="h-4 w-4 text-indigo-600" />;
      case 'delivery':
        return <Truck className="h-4 w-4 text-emerald-600" />;
      case 'driver':
        return <PackageCheck className="h-4 w-4 text-amber-600" />;
      case 'user':
        return <UserCheck className="h-4 w-4 text-teal-600" />;
      default:
        return <Bell className="h-4 w-4 text-slate-600" />;
    }
  };

  if (!userId) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-xl p-2.5 text-slate-700 hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-black text-white shadow-md animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 rounded-[24px] border border-slate-200/90 bg-white/95 p-4 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 hover:text-sky-800"
                >
                  <Check className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="mt-2 max-h-[380px] overflow-y-auto divide-y divide-slate-100 space-y-1">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                <Bell className="mx-auto h-7 w-7 text-slate-300 mb-2" />
                <p className="font-semibold">No notifications yet</p>
                <p className="text-[11px] text-slate-400">Updates on prescriptions and deliveries will appear here.</p>
              </div>
            ) : (
              notifications.slice(0, 8).map((n) => {
                const meta = getNotificationMeta(n.type);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleMarkOne(n)}
                    className={`w-full text-left p-3 rounded-2xl transition flex items-start gap-3 ${
                      n.isRead ? 'bg-white hover:bg-slate-50 opacity-75' : 'bg-sky-50/60 hover:bg-sky-50 font-medium'
                    }`}
                  >
                    <div className="mt-0.5 rounded-xl bg-white p-2 border border-slate-200/80 shadow-xs flex-shrink-0">
                      {getIcon(meta.iconType)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-black text-slate-900 truncate">{meta.title}</p>
                        {!n.isRead && (
                          <span className="h-2 w-2 rounded-full bg-sky-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {n.message}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        <span>{formatTimeAgo(n.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="mt-3 border-t border-slate-100 pt-2.5 text-center">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/notifications');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-800"
            >
              <span>View All Notifications</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
