import { env } from '../config/env.js';

export type PushNotificationResult = {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  messageId?: string;
  error?: string;
};

// Firebase Admin SDK
let admin: any = null;
if (env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const adminModule = await import('firebase-admin');
    admin = adminModule.default;
    
    // Initialize Firebase Admin (assumes GOOGLE_APPLICATION_CREDENTIALS env var is set)
    if (!admin.apps.length) {
      admin.initializeApp();
    }
  } catch (error) {
    console.error('[Push] Failed to initialize Firebase Admin:', error);
  }
}

export type PushNotificationPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: string;
  sound?: string;
};

/**
 * Send push notification via Firebase Cloud Messaging
 */
export const sendPushNotification = async (
  deviceToken: string,
  payload: PushNotificationPayload
): Promise<PushNotificationResult> => {
  try {
    if (!admin) {
      console.warn('[Push] Firebase Admin not initialized');
      return { status: 'SKIPPED', error: 'Firebase not configured' };
    }

    if (!deviceToken || !deviceToken.trim()) {
      return { status: 'FAILED', error: 'Invalid device token' };
    }

    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.badge && { badge: payload.badge }),
        ...(payload.sound && { sound: payload.sound })
      },
      data: payload.data || {},
      token: deviceToken,
      android: {
        priority: 'high' as const,
        ttl: 86400 // 24 hours
      },
      apns: {
        headers: {
          'apns-priority': '10'
        }
      },
      webpush: {
        headers: {
          TTL: '86400'
        }
      }
    };

    const messageId = await admin.messaging().send(message);

    console.info('[Push] Sent notification:', {
      deviceToken: deviceToken.substring(0, 20) + '...',
      title: payload.title,
      messageId
    });

    return { status: 'SENT', messageId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Push] Firebase error:', errorMessage);
    return { status: 'FAILED', error: errorMessage };
  }
};

/**
 * Send push notification to multiple devices
 */
export const sendMulticastPushNotification = async (
  deviceTokens: string[],
  payload: PushNotificationPayload
): Promise<{ successful: string[]; failed: string[] }> => {
  const successful: string[] = [];
  const failed: string[] = [];

  for (const token of deviceTokens) {
    const result = await sendPushNotification(token, payload);
    if (result.status === 'SENT') {
      successful.push(token);
    } else {
      failed.push(token);
    }
  }

  return { successful, failed };
};

/**
 * Send push notification to all devices (topic-based)
 */
export const sendTopicPushNotification = async (
  topic: string,
  payload: PushNotificationPayload
): Promise<PushNotificationResult> => {
  try {
    if (!admin) {
      console.warn('[Push] Firebase Admin not initialized');
      return { status: 'SKIPPED', error: 'Firebase not configured' };
    }

    const message = {
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.badge && { badge: payload.badge }),
        ...(payload.sound && { sound: payload.sound })
      },
      data: payload.data || {},
      topic: topic,
      android: {
        priority: 'high' as const,
        ttl: 86400
      },
      apns: {
        headers: {
          'apns-priority': '10'
        }
      }
    };

    const messageId = await admin.messaging().send(message);

    console.info('[Push] Sent topic notification:', {
      topic,
      title: payload.title,
      messageId
    });

    return { status: 'SENT', messageId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Push] Topic notification error:', errorMessage);
    return { status: 'FAILED', error: errorMessage };
  }
};

/**
 * Subscribe device to topic
 */
export const subscribeToTopic = async (
  deviceToken: string,
  topic: string
): Promise<void> => {
  try {
    if (!admin) {
      console.warn('[Push] Firebase Admin not initialized');
      return;
    }

    await admin.messaging().subscribeToTopic(deviceToken, topic);
    console.info('[Push] Subscribed device to topic:', { topic });
  } catch (error) {
    console.error('[Push] Subscribe error:', error);
  }
};

/**
 * Unsubscribe device from topic
 */
export const unsubscribeFromTopic = async (
  deviceToken: string,
  topic: string
): Promise<void> => {
  try {
    if (!admin) {
      console.warn('[Push] Firebase Admin not initialized');
      return;
    }

    await admin.messaging().unsubscribeFromTopic(deviceToken, topic);
    console.info('[Push] Unsubscribed device from topic:', { topic });
  } catch (error) {
    console.error('[Push] Unsubscribe error:', error);
  }
};

export const PushNotificationService = {
  sendPushNotification,
  sendMulticastPushNotification,
  sendTopicPushNotification,
  subscribeToTopic,
  unsubscribeFromTopic
};
