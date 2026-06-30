import { FamilyRelationshipRequestStatus, FriendRelationshipRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { countUnreadChatThreads } from "@/modules/chat-messages/chat-messages.service";
import { countUnreadMail } from "@/modules/mail/mail.service";

const MODULE_KEY = "notifications-alerts";
const NOTIFICATION_DB_TIMEOUT_MS = 1800;
const UNREAD_NOTIFICATION_RETENTION_DAYS = 14;

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

export type AlertListItem = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
  familyRequest?: {
    id: string;
    requesterName: string;
    requesterUsername: string;
    relationshipLabel: string;
    message: string | null;
    status: FamilyRelationshipRequestStatus;
  } | null;
  friendRequest?: {
    id: string;
    requesterName: string;
    requesterUsername: string;
    message: string | null;
    status: FriendRelationshipRequestStatus;
  } | null;
};

async function purgeExpiredUnreadNotifications(userId: string) {
  const cutoff = new Date(Date.now() - UNREAD_NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.notification.deleteMany({
    where: {
      userId,
      readAt: null,
      createdAt: {
        lt: cutoff
      }
    }
  });
}

export async function getUnreadCounts(userId?: string): Promise<UnreadCounts> {
  if (!userId) {
    return { notifications: 0, alerts: 0, mail: 0, messages: 0 };
  }

  try {
    await purgeExpiredUnreadNotifications(userId);
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
    await purgeExpiredUnreadNotifications(userId);
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
    const alerts = await withNotificationTimeout(
      prisma.alert.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50
      }),
      "alert list lookup"
    );
    const familyRequests = await prisma.familyRelationshipRequest.findMany({
      where: {
        targetUserId: userId,
        alertId: {
          in: alerts.map((alert) => alert.id)
        }
      },
      include: {
        requester: {
          include: {
            profile: true
          }
        }
      }
    });
    const friendRequests = await prisma.friendRelationshipRequest.findMany({
      where: {
        targetUserId: userId,
        alertId: {
          in: alerts.map((alert) => alert.id)
        }
      },
      include: {
        requester: {
          include: {
            profile: true
          }
        }
      }
    });
    const familyRequestMap = new Map(familyRequests.map((request) => [request.alertId, request]));
    const friendRequestMap = new Map(friendRequests.map((request) => [request.alertId, request]));

    return alerts.map<AlertListItem>((alert) => {
      const familyRequest = familyRequestMap.get(alert.id);
      const friendRequest = friendRequestMap.get(alert.id);

      return {
        ...alert,
        familyRequest: familyRequest
          ? {
              id: familyRequest.id,
              requesterName: familyRequest.requester.profile?.displayName ?? familyRequest.requester.username,
              requesterUsername: familyRequest.requester.username,
              relationshipLabel: familyRequest.relationshipLabel,
              message: familyRequest.message,
              status: familyRequest.status
            }
          : null,
        friendRequest: friendRequest
          ? {
              id: friendRequest.id,
              requesterName: friendRequest.requester.profile?.displayName ?? friendRequest.requester.username,
              requesterUsername: friendRequest.requester.username,
              message: friendRequest.message,
              status: friendRequest.status
            }
          : null
      };
    });
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

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() }
  });

  return { ok: true as const };
}

export async function hideNotifications(userId: string, notificationIds: string[]) {
  const ids = Array.from(new Set(notificationIds.filter((id) => typeof id === "string" && id.trim().length > 0)));
  if (ids.length === 0) return { ok: true as const, hidden: 0 };

  const result = await prisma.notification.deleteMany({
    where: {
      userId,
      id: {
        in: ids
      }
    }
  });

  return { ok: true as const, hidden: result.count };
}

export async function markAlertRead(userId: string, alertId: string) {
  await prisma.alert.updateMany({
    where: { id: alertId, userId },
    data: { readAt: new Date() }
  });

  return { ok: true as const };
}
