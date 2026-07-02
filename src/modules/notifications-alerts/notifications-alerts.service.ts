import { FamilyRelationshipRequestStatus, FriendRelationshipRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { countUnreadChatThreads } from "@/modules/chat-messages/chat-messages.service";
import { countUnreadMail } from "@/modules/mail/mail.service";

const MODULE_KEY = "notifications-alerts";
const NOTIFICATION_DB_TIMEOUT_MS = 1800;
const UNREAD_NOTIFICATION_RETENTION_DAYS = 14;
const ALERT_RETENTION_DAYS = 14;

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

export type NoticeListItem = {
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

export type AlertListItem = NoticeListItem;

export type ShellNoticeSummaryItem = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: Date;
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

async function purgeExpiredAlerts(userId: string) {
  const cutoff = new Date(Date.now() - ALERT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.alert.deleteMany({
    where: {
      userId,
      createdAt: {
        lt: cutoff
      }
    }
  });
}

async function migratePendingRelationshipRequestAlertsToNotifications(userId: string) {
  const [familyRequests, friendRequests] = await Promise.all([
    prisma.familyRelationshipRequest.findMany({
      where: {
        targetUserId: userId,
        status: FamilyRelationshipRequestStatus.PENDING,
        notificationId: null,
        alertId: { not: null }
      },
      include: {
        requester: { include: { profile: true } }
      }
    }),
    prisma.friendRelationshipRequest.findMany({
      where: {
        targetUserId: userId,
        status: FriendRelationshipRequestStatus.PENDING,
        notificationId: null,
        alertId: { not: null }
      },
      include: {
        requester: { include: { profile: true } }
      }
    })
  ]);

  for (const request of familyRequests) {
    const requesterName = request.requester.profile?.displayName ?? request.requester.username;
    const notification = await prisma.notification.create({
      data: {
        userId,
        title: "Family tag approval needed",
        body: `${requesterName} wants to list you as ${request.relationshipLabel} on their profile. Approve only if this is correct.`,
        href: `/notifications?familyRequestId=${request.id}`
      }
    });
    await prisma.familyRelationshipRequest.update({
      where: { id: request.id },
      data: { notificationId: notification.id }
    });
    if (request.alertId) {
      await prisma.alert.updateMany({
        where: { id: request.alertId, userId },
        data: { readAt: new Date() }
      });
    }
  }

  for (const request of friendRequests) {
    const requesterName = request.requester.profile?.displayName ?? request.requester.username;
    const notification = await prisma.notification.create({
      data: {
        userId,
        title: "Friend request approval needed",
        body: `${requesterName} wants to add you as a friend on Theta-Space.`,
        href: `/notifications?friendRequestId=${request.id}`
      }
    });
    await prisma.friendRelationshipRequest.update({
      where: { id: request.id },
      data: { notificationId: notification.id }
    });
    if (request.alertId) {
      await prisma.alert.updateMany({
        where: { id: request.alertId, userId },
        data: { readAt: new Date() }
      });
    }
  }
}

export async function getUnreadCounts(userId?: string): Promise<UnreadCounts> {
  if (!userId) {
    return { notifications: 0, alerts: 0, mail: 0, messages: 0 };
  }

  try {
    await purgeExpiredUnreadNotifications(userId);
    await migratePendingRelationshipRequestAlertsToNotifications(userId);
    await purgeExpiredAlerts(userId);
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
    await migratePendingRelationshipRequestAlertsToNotifications(userId);
    const notifications = await withNotificationTimeout(
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50
      }),
      "notification list lookup"
    );
    const familyRequests = await prisma.familyRelationshipRequest.findMany({
      where: {
        targetUserId: userId,
        notificationId: {
          in: notifications.map((notification) => notification.id)
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
        notificationId: {
          in: notifications.map((notification) => notification.id)
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
    const familyRequestMap = new Map(familyRequests.map((request) => [request.notificationId, request]));
    const friendRequestMap = new Map(friendRequests.map((request) => [request.notificationId, request]));

    return notifications.map<NoticeListItem>((notification) => {
      const familyRequest = familyRequestMap.get(notification.id);
      const friendRequest = friendRequestMap.get(notification.id);

      return {
        ...notification,
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
    }).filter((notification) => {
      if (notification.familyRequest) return notification.familyRequest.status === FamilyRelationshipRequestStatus.PENDING;
      if (notification.friendRequest) return notification.friendRequest.status === FriendRelationshipRequestStatus.PENDING;
      return true;
    });
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
    await purgeExpiredAlerts(userId);
    const alerts = await withNotificationTimeout(
      prisma.alert.findMany({
        where: { userId, readAt: null },
        orderBy: { createdAt: "desc" },
        take: 50
      }),
      "alert list lookup"
    );
    return alerts.map<AlertListItem>((alert) => ({
      ...alert,
      familyRequest: null,
      friendRequest: null
    }));
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list alerts.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function listShellNoticeSummary(userId: string, type: "alerts" | "notifications"): Promise<ShellNoticeSummaryItem[]> {
  const items = type === "alerts" ? await listAlerts(userId) : await listNotifications(userId);

  return items.slice(0, 3).map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    href: item.href,
    createdAt: item.createdAt
  }));
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
