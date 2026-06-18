import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { countUnreadChatThreads } from "@/modules/chat-messages/chat-messages.service";
import { countUnreadMail } from "@/modules/mail/mail.service";

const MODULE_KEY = "notifications-alerts";
const NOTIFICATION_DB_TIMEOUT_MS = 1800;

function withNotificationTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), NOTIFICATION_DB_TIMEOUT_MS);
    })
  ]);
}

export type UnreadCounts = {
  notifications: number;
  alerts: number;
  mail: number;
  messages: number;
};

export async function getUnreadCounts(userId?: string): Promise<UnreadCounts> {
  if (!userId) {
    return { notifications: 0, alerts: 0, mail: 0, messages: 0 };
  }

  try {
    const [notifications, alerts, messages, mail] = await withNotificationTimeout(
      Promise.all([
        prisma.notification.count({ where: { userId, readAt: null } }),
        prisma.alert.count({ where: { userId, readAt: null } }),
        countUnreadChatThreads(userId),
        countUnreadMail(userId)
      ]),
      "unread count lookup"
    );

    return { notifications, alerts, mail, messages };
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load unread counts.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { notifications: 0, alerts: 0, mail: 0, messages: 0 };
  }
}

export async function listNotifications(userId: string) {
  try {
    return await withNotificationTimeout(
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50
      }),
      "notification list lookup"
    );
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list notifications.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function listAlerts(userId: string) {
  try {
    return await withNotificationTimeout(
      prisma.alert.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50
      }),
      "alert list lookup"
    );
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list alerts.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function markNotificationRead(userId: string, notificationId: string) {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() }
  });

  return { ok: true as const };
}

export async function markAlertRead(userId: string, alertId: string) {
  await prisma.alert.updateMany({
    where: { id: alertId, userId },
    data: { readAt: new Date() }
  });

  return { ok: true as const };
}
