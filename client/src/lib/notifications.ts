import { getSupabaseClient } from './supabase';

export type AppNotification = {
  id: string;
  userId: string;
  message: string;
  type: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED';
  provider?: string;
  providerRef?: string;
  createdAt: string;
  updatedAt?: string;
  isRead: boolean;
};

/**
 * Format notification title and human-friendly category from type
 */
export function getNotificationMeta(type: string): {
  title: string;
  badgeColor: string;
  iconType: 'prescription' | 'order' | 'delivery' | 'driver' | 'system' | 'user';
} {
  const normalized = (type || '').toUpperCase();

  if (normalized.includes('PRESCRIPTION_APPROVED') || normalized.includes('APPROVED')) {
    return { title: 'Prescription Approved', badgeColor: 'bg-emerald-100 text-emerald-800', iconType: 'prescription' };
  }
  if (normalized.includes('PRESCRIPTION_REJECTED') || normalized.includes('REJECTED')) {
    return { title: 'Prescription Review Notice', badgeColor: 'bg-red-100 text-red-800', iconType: 'prescription' };
  }
  if (normalized.includes('PRESCRIPTION')) {
    return { title: 'Prescription Submitted', badgeColor: 'bg-sky-100 text-sky-800', iconType: 'prescription' };
  }
  if (normalized.includes('ORDER_BEING_PREPARED')) {
    return { title: 'Order Being Prepared', badgeColor: 'bg-indigo-100 text-indigo-800', iconType: 'order' };
  }
  if (normalized.includes('ORDER_READY_FOR_PICKUP')) {
    return { title: 'Order Ready For Pickup', badgeColor: 'bg-blue-100 text-blue-800', iconType: 'order' };
  }
  if (normalized.includes('DRIVER_COLLECTED') || normalized.includes('COLLECTED')) {
    return { title: 'Medication Collected', badgeColor: 'bg-teal-100 text-teal-800', iconType: 'delivery' };
  }
  if (normalized.includes('DELIVERY_STARTED') || normalized.includes('IN_TRANSIT')) {
    return { title: 'Delivery Started', badgeColor: 'bg-sky-100 text-sky-800', iconType: 'delivery' };
  }
  if (normalized.includes('NEAR_DESTINATION')) {
    return { title: 'Driver Near Destination', badgeColor: 'bg-amber-100 text-amber-800', iconType: 'driver' };
  }
  if (normalized.includes('DELIVERED')) {
    return { title: 'Package Delivered', badgeColor: 'bg-emerald-100 text-emerald-800', iconType: 'delivery' };
  }
  if (normalized.includes('COMPLETED')) {
    return { title: 'Order Completed', badgeColor: 'bg-emerald-100 text-emerald-800', iconType: 'order' };
  }
  if (normalized.includes('DRIVER_ASSIGNED')) {
    return { title: 'Driver Assigned', badgeColor: 'bg-purple-100 text-purple-800', iconType: 'driver' };
  }
  if (normalized.includes('ACCOUNT_CREATED')) {
    return { title: 'Welcome to PharmaFind', badgeColor: 'bg-emerald-100 text-emerald-800', iconType: 'user' };
  }
  if (normalized.includes('NEW_ORDER') || normalized.includes('NEW_DELIVERY')) {
    return { title: 'New Dispatch Alert', badgeColor: 'bg-amber-100 text-amber-800', iconType: 'order' };
  }

  return { title: 'System Notification', badgeColor: 'bg-slate-100 text-slate-800', iconType: 'system' };
}

/**
 * Format relative time (e.g., "Just now", "5 mins ago", "2 hours ago")
 */
export function formatTimeAgo(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 30) return 'Just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return 'Recent';
  }
}

/**
 * Create a new notification record in the database
 */
export async function createInAppNotification(
  userId: string,
  message: string,
  type: string
): Promise<boolean> {
  if (!userId || !message) return false;

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('Notification').insert([
      {
        userId,
        message,
        type,
        provider: 'SYSTEM',
        status: 'SENT'
      }
    ]);

    if (error) {
      console.warn('[Notification] Database insert error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Notification] Exception inserting notification:', err);
    return false;
  }
}

/**
 * Notify all users with a specific role (e.g., PHARMACIST, DRIVER, SYSTEM_ADMIN)
 */
export async function notifyUsersWithRole(
  role: 'PHARMACIST' | 'DRIVER' | 'SYSTEM_ADMIN' | 'PHARMACY_ADMIN',
  message: string,
  type: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: users, error } = await supabase
      .from('User')
      .select('id')
      .eq('role', role);

    if (error || !users || users.length === 0) return;

    const notifications = users.map((u) => ({
      userId: u.id,
      message,
      type,
      provider: 'SYSTEM',
      status: 'SENT'
    }));

    await supabase.from('Notification').insert(notifications);
  } catch (err) {
    console.warn(`[Notification] Failed to notify role ${role}:`, err);
  }
}

/**
 * Fetch all notifications for a specific user with local read state resolution
 */
export async function fetchUserNotifications(userId: string): Promise<AppNotification[]> {
  if (!userId) return [];

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('Notification')
      .select('*')
      .eq('userId', userId)
      .order('createdAt', { ascending: false })
      .limit(40);

    if (error) {
      console.warn('[Notification] Fetch error:', error.message);
      return [];
    }

    const rows = data ?? [];

    // Local read set resolution from localStorage
    let readIds = new Set<string>();
    try {
      const saved = localStorage.getItem(`pharmafind_read_notifs_${userId}`);
      if (saved) readIds = new Set(JSON.parse(saved));
    } catch {}

    return rows.map((r) => {
      const isRead = r.status === 'DELIVERED' || readIds.has(r.id);
      return {
        id: r.id,
        userId: r.userId,
        message: r.message,
        type: r.type,
        status: r.status,
        provider: r.provider,
        providerRef: r.providerRef,
        createdAt: r.createdAt || new Date().toISOString(),
        updatedAt: r.updatedAt,
        isRead
      };
    });
  } catch (err) {
    console.warn('[Notification] Exception fetching notifications:', err);
    return [];
  }
}

/**
 * Mark a single notification as read
 */
export async function markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
  try {
    // 1. Save to local storage
    try {
      const saved = localStorage.getItem(`pharmafind_read_notifs_${userId}`);
      const set = new Set(saved ? JSON.parse(saved) : []);
      set.add(notificationId);
      localStorage.setItem(`pharmafind_read_notifs_${userId}`, JSON.stringify([...set]));
    } catch {}

    // 2. Update status in Supabase
    const supabase = getSupabaseClient();
    await supabase
      .from('Notification')
      .update({ status: 'DELIVERED', updatedAt: new Date().toISOString() })
      .eq('id', notificationId);
  } catch (err) {
    console.warn('[Notification] Failed to mark read:', err);
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string, notificationIds: string[]): Promise<void> {
  try {
    // 1. Save all to local storage
    try {
      const saved = localStorage.getItem(`pharmafind_read_notifs_${userId}`);
      const set = new Set(saved ? JSON.parse(saved) : []);
      notificationIds.forEach((id) => set.add(id));
      localStorage.setItem(`pharmafind_read_notifs_${userId}`, JSON.stringify([...set]));
    } catch {}

    // 2. Update all in Supabase
    const supabase = getSupabaseClient();
    await supabase
      .from('Notification')
      .update({ status: 'DELIVERED', updatedAt: new Date().toISOString() })
      .eq('userId', userId);
  } catch (err) {
    console.warn('[Notification] Failed to mark all read:', err);
  }
}
