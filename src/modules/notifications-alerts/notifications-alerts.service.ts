import { FamilyRelationshipRequestStatus, FriendRelationshipRequestStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { countUnreadChatThreads } from "@/modules/chat-messages/chat-messages.service";
import { countUnreadMail } from "@/modules/mail/mail.service";

const MODULE_KEY = "notifications-alerts";
const NOTIFICATION_DB_TIMEOUT_MS = 1800;
const READ_NOTIFICATION_RETENTION_DAYS = 90;
const ALERT_RETENTION_DAYS = 14;
const DEFAULT_NOTICE_PAGE_SIZE = 25;
const MAX_NOTICE_PAGE_SIZE = 50;
const MAX_HIDE_BATCH_SIZE = 100;
const INTERACTION_DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const RELATIONSHIP_DEDUPE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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

export type NoticePage<T extends NoticeListItem = NoticeListItem> = {
  items: T[];
  nextCursor: string | null;
};

export type ShellNoticeSummaryItem = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: Date;
};

async function purgeExpiredReadNotifications(userId: string) {
  const cutoff = new Date(Date.now() - READ_NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.notification.deleteMany({
    where: {
      userId,
      readAt: {
        not: null,
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

type TrustedNotificationInput = {
  userId: string;
  title: string;
  body?: string | null;
  href: string;
  dedupeWindowMs?: number;
  dedupeBy?: "exact" | "title-href";
};

function cleanIdentifier(value: unknown) {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  return clean.length <= 100 ? clean : "";
}

function normalizeInternalHref(value: string) {
  const href = value.trim();
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || /[\u0000-\u001f\u007f]/.test(href)) {
    throw new Error("Notification target must be an internal application path.");
  }

  const parsed = new URL(href, "https://theta-space.invalid");
  if (parsed.origin !== "https://theta-space.invalid") {
    throw new Error("Notification target must be an internal application path.");
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 600);
}

function normalizeTrustedNotification(input: TrustedNotificationInput) {
  const userId = cleanIdentifier(input.userId);
  const title = input.title.trim().replace(/\s+/g, " ").slice(0, 180);
  const body = input.body?.trim().replace(/\s+/g, " ").slice(0, 500) || null;

  if (!userId || !title) {
    throw new Error("Notification owner and title are required.");
  }

  return {
    userId,
    title,
    body,
    href: normalizeInternalHref(input.href),
    dedupeWindowMs: Math.max(1, input.dedupeWindowMs ?? INTERACTION_DEDUPE_WINDOW_MS),
    dedupeBy: input.dedupeBy ?? "exact"
  };
}

async function createDeduplicatedNotification(transaction: Prisma.TransactionClient, input: TrustedNotificationInput) {
  const clean = normalizeTrustedNotification(input);
  const existing = await transaction.notification.findFirst({
    where: {
      userId: clean.userId,
      title: clean.title,
      href: clean.href,
      readAt: null,
      createdAt: {
        gte: new Date(Date.now() - clean.dedupeWindowMs)
      },
      ...(clean.dedupeBy === "exact" ? { body: clean.body } : {})
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });

  if (existing) {
    const notification =
      clean.dedupeBy === "title-href" && existing.body !== clean.body
        ? await transaction.notification.update({
            where: { id: existing.id },
            data: { body: clean.body }
          })
        : existing;
    return { notification, created: false as const };
  }

  const notification = await transaction.notification.create({
    data: {
      userId: clean.userId,
      title: clean.title,
      body: clean.body,
      href: clean.href
    }
  });

  return { notification, created: true as const };
}

async function ensureFriendRequestNotificationInTransaction(transaction: Prisma.TransactionClient, requestId: string) {
  const request = await transaction.friendRelationshipRequest.findFirst({
    where: {
      id: requestId,
      status: FriendRelationshipRequestStatus.PENDING
    },
    include: {
      requester: { include: { profile: true } }
    }
  });

  if (!request) return null;

  if (request.notificationId) {
    const linked = await transaction.notification.findFirst({
      where: { id: request.notificationId, userId: request.targetUserId }
    });
    if (linked) return linked;
  }

  const requesterName = request.requester.profile?.displayName ?? request.requester.username;
  const ensured = await createDeduplicatedNotification(transaction, {
    userId: request.targetUserId,
    title: "Friend request approval needed",
    body: `${requesterName} wants to add you as a friend on Theta-Space.`,
    href: `/notifications?friendRequestId=${encodeURIComponent(request.id)}`,
    dedupeWindowMs: RELATIONSHIP_DEDUPE_WINDOW_MS
  });
  const claimed = await transaction.friendRelationshipRequest.updateMany({
    where: {
      id: request.id,
      targetUserId: request.targetUserId,
      status: FriendRelationshipRequestStatus.PENDING,
      notificationId: request.notificationId
    },
    data: { notificationId: ensured.notification.id }
  });

  if (claimed.count !== 1) {
    if (ensured.created) {
      await transaction.notification.deleteMany({
        where: { id: ensured.notification.id, userId: request.targetUserId }
      });
    }
    const current = await transaction.friendRelationshipRequest.findUnique({
      where: { id: request.id },
      select: { notificationId: true }
    });
    return current?.notificationId
      ? transaction.notification.findFirst({ where: { id: current.notificationId, userId: request.targetUserId } })
      : null;
  }

  if (request.alertId) {
    await transaction.alert.updateMany({
      where: { id: request.alertId, userId: request.targetUserId },
      data: { readAt: new Date() }
    });
  }

  return ensured.notification;
}

async function ensureFamilyRequestNotificationInTransaction(transaction: Prisma.TransactionClient, requestId: string) {
  const request = await transaction.familyRelationshipRequest.findFirst({
    where: {
      id: requestId,
      status: FamilyRelationshipRequestStatus.PENDING
    },
    include: {
      requester: { include: { profile: true } }
    }
  });

  if (!request) return null;

  if (request.notificationId) {
    const linked = await transaction.notification.findFirst({
      where: { id: request.notificationId, userId: request.targetUserId }
    });
    if (linked) return linked;
  }

  const requesterName = request.requester.profile?.displayName ?? request.requester.username;
  const ensured = await createDeduplicatedNotification(transaction, {
    userId: request.targetUserId,
    title: "Family tag approval needed",
    body: `${requesterName} wants to list you as ${request.relationshipLabel} on their profile. Approve only if this is correct.`,
    href: `/notifications?familyRequestId=${encodeURIComponent(request.id)}`,
    dedupeWindowMs: RELATIONSHIP_DEDUPE_WINDOW_MS
  });
  const claimed = await transaction.familyRelationshipRequest.updateMany({
    where: {
      id: request.id,
      targetUserId: request.targetUserId,
      status: FamilyRelationshipRequestStatus.PENDING,
      notificationId: request.notificationId
    },
    data: { notificationId: ensured.notification.id }
  });

  if (claimed.count !== 1) {
    if (ensured.created) {
      await transaction.notification.deleteMany({
        where: { id: ensured.notification.id, userId: request.targetUserId }
      });
    }
    const current = await transaction.familyRelationshipRequest.findUnique({
      where: { id: request.id },
      select: { notificationId: true }
    });
    return current?.notificationId
      ? transaction.notification.findFirst({ where: { id: current.notificationId, userId: request.targetUserId } })
      : null;
  }

  if (request.alertId) {
    await transaction.alert.updateMany({
      where: { id: request.alertId, userId: request.targetUserId },
      data: { readAt: new Date() }
    });
  }

  return ensured.notification;
}

export async function ensureFriendRequestNotification(requestId: string, transaction?: Prisma.TransactionClient) {
  const cleanRequestId = cleanIdentifier(requestId);
  if (!cleanRequestId) return null;
  return transaction
    ? ensureFriendRequestNotificationInTransaction(transaction, cleanRequestId)
    : prisma.$transaction((tx) => ensureFriendRequestNotificationInTransaction(tx, cleanRequestId));
}

export async function ensureFamilyRequestNotification(requestId: string, transaction?: Prisma.TransactionClient) {
  const cleanRequestId = cleanIdentifier(requestId);
  if (!cleanRequestId) return null;
  return transaction
    ? ensureFamilyRequestNotificationInTransaction(transaction, cleanRequestId)
    : prisma.$transaction((tx) => ensureFamilyRequestNotificationInTransaction(tx, cleanRequestId));
}

async function notifyFriendRequestOutcomeInTransaction(transaction: Prisma.TransactionClient, requestId: string) {
  const request = await transaction.friendRelationshipRequest.findFirst({
    where: {
      id: requestId,
      status: { in: [FriendRelationshipRequestStatus.APPROVED, FriendRelationshipRequestStatus.DENIED] }
    },
    include: {
      target: { include: { profile: true } }
    }
  });
  if (!request) return null;

  const approved = request.status === FriendRelationshipRequestStatus.APPROVED;
  const targetName = request.target.profile?.displayName ?? request.target.username;
  return createDeduplicatedNotification(transaction, {
    userId: request.requesterUserId,
    title: approved ? "Friend request approved" : "Friend request denied",
    body: approved
      ? `${targetName} approved your friend request.`
      : `${targetName} did not approve the friend request.`,
    href: `/profile/${encodeURIComponent(request.target.username)}`,
    dedupeWindowMs: RELATIONSHIP_DEDUPE_WINDOW_MS
  });
}

async function notifyFamilyRequestOutcomeInTransaction(transaction: Prisma.TransactionClient, requestId: string) {
  const request = await transaction.familyRelationshipRequest.findFirst({
    where: {
      id: requestId,
      status: { in: [FamilyRelationshipRequestStatus.APPROVED, FamilyRelationshipRequestStatus.DENIED] }
    },
    include: {
      target: { include: { profile: true } }
    }
  });
  if (!request) return null;

  const approved = request.status === FamilyRelationshipRequestStatus.APPROVED;
  const targetName = request.target.profile?.displayName ?? request.target.username;
  return createDeduplicatedNotification(transaction, {
    userId: request.requesterUserId,
    title: approved ? "Family tag approved" : "Family tag request denied",
    body: approved
      ? `${targetName} approved your family tag request.`
      : `${targetName} did not approve the family tag request.`,
    href: `/profile/${encodeURIComponent(request.target.username)}`,
    dedupeWindowMs: RELATIONSHIP_DEDUPE_WINDOW_MS
  });
}

export async function notifyFriendRequestOutcome(requestId: string, transaction?: Prisma.TransactionClient) {
  const cleanRequestId = cleanIdentifier(requestId);
  if (!cleanRequestId) return null;
  return transaction
    ? notifyFriendRequestOutcomeInTransaction(transaction, cleanRequestId)
    : prisma.$transaction((tx) => notifyFriendRequestOutcomeInTransaction(tx, cleanRequestId));
}

export async function notifyFamilyRequestOutcome(requestId: string, transaction?: Prisma.TransactionClient) {
  const cleanRequestId = cleanIdentifier(requestId);
  if (!cleanRequestId) return null;
  return transaction
    ? notifyFamilyRequestOutcomeInTransaction(transaction, cleanRequestId)
    : prisma.$transaction((tx) => notifyFamilyRequestOutcomeInTransaction(tx, cleanRequestId));
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
      select: { id: true }
    }),
    prisma.friendRelationshipRequest.findMany({
      where: {
        targetUserId: userId,
        status: FriendRelationshipRequestStatus.PENDING,
        notificationId: null,
        alertId: { not: null }
      },
      select: { id: true }
    })
  ]);

  for (const request of familyRequests) {
    await ensureFamilyRequestNotification(request.id);
  }

  for (const request of friendRequests) {
    await ensureFriendRequestNotification(request.id);
  }
}

type InteractionNotification = Omit<TrustedNotificationInput, "dedupeWindowMs">;

async function loadActor(transaction: Prisma.TransactionClient, actorUserId: string) {
  return transaction.user.findUnique({
    where: { id: actorUserId },
    select: {
      id: true,
      username: true,
      deactivatedAt: true,
      profile: { select: { displayName: true } }
    }
  });
}

function actorDisplayName(actor: { username: string; profile: { displayName: string | null } | null }) {
  return actor.profile?.displayName?.trim() || actor.username;
}

async function dispatchInteractionNotifications(
  transaction: Prisma.TransactionClient,
  notifications: InteractionNotification[]
) {
  const unique = new Map<string, InteractionNotification>();
  for (const notification of notifications) {
    const key = `${notification.userId}\0${notification.title}\0${notification.href}`;
    if (!unique.has(key)) unique.set(key, notification);
  }

  let createdCount = 0;
  let deduplicatedCount = 0;
  for (const notification of unique.values()) {
    const result = await createDeduplicatedNotification(transaction, {
      ...notification,
      dedupeWindowMs: INTERACTION_DEDUPE_WINDOW_MS
    });
    if (result.created) createdCount += 1;
    else deduplicatedCount += 1;
  }

  return { createdCount, deduplicatedCount };
}

function runNotificationTransaction<T>(
  transaction: Prisma.TransactionClient | undefined,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
) {
  return transaction ? operation(transaction) : prisma.$transaction(operation);
}

export async function notifyFeedCommentCreated(
  actorUserId: string,
  commentId: string,
  existingTransaction?: Prisma.TransactionClient
) {
  const actorId = cleanIdentifier(actorUserId);
  const targetId = cleanIdentifier(commentId);
  if (!actorId || !targetId) return { ok: false as const, error: "Invalid feed interaction." };

  return runNotificationTransaction(existingTransaction, async (transaction) => {
    const comment = await transaction.feedComment.findUnique({
      where: { id: targetId },
      select: { id: true, authorUserId: true, body: true, postId: true, parentCommentId: true }
    });
    if (!comment || comment.authorUserId !== actorId) {
      return { ok: false as const, error: "Feed interaction was not found." };
    }

    const [actor, post, parent] = await Promise.all([
      loadActor(transaction, actorId),
      transaction.feedPost.findUnique({ where: { id: comment.postId }, select: { authorUserId: true } }),
      comment.parentCommentId
        ? transaction.feedComment.findUnique({ where: { id: comment.parentCommentId }, select: { authorUserId: true } })
        : null
    ]);
    if (!actor || actor.deactivatedAt || !post) {
      return { ok: false as const, error: "Feed interaction was not found." };
    }

    const name = actorDisplayName(actor);
    const href = `/posts/${encodeURIComponent(comment.postId)}?commentId=${encodeURIComponent(comment.id)}`;
    const notifications: InteractionNotification[] = [];
    if (post.authorUserId !== actorId) {
      notifications.push({
        userId: post.authorUserId,
        title: `${name} replied to your stream post`,
        body: comment.body,
        href
      });
    }
    if (parent?.authorUserId && parent.authorUserId !== actorId && parent.authorUserId !== post.authorUserId) {
      notifications.push({
        userId: parent.authorUserId,
        title: `${name} replied to your comment`,
        body: comment.body,
        href
      });
    }

    const result = await dispatchInteractionNotifications(transaction, notifications);
    return { ok: true as const, ...result };
  });
}

export async function notifyFeedPostReaction(
  actorUserId: string,
  postId: string,
  existingTransaction?: Prisma.TransactionClient
) {
  const actorId = cleanIdentifier(actorUserId);
  const targetId = cleanIdentifier(postId);
  if (!actorId || !targetId) return { ok: false as const, error: "Invalid feed interaction." };

  return runNotificationTransaction(existingTransaction, async (transaction) => {
    const [actor, post, reaction] = await Promise.all([
      loadActor(transaction, actorId),
      transaction.feedPost.findUnique({ where: { id: targetId }, select: { authorUserId: true } }),
      transaction.feedPostReaction.findUnique({
        where: { postId_userId: { postId: targetId, userId: actorId } },
        select: { type: true }
      })
    ]);
    if (!actor || actor.deactivatedAt || !post || !reaction) {
      return { ok: false as const, error: "Feed interaction was not found." };
    }
    if (reaction.type === "DISLIKE" || post.authorUserId === actorId) {
      return { ok: true as const, createdCount: 0, deduplicatedCount: 0 };
    }

    const result = await dispatchInteractionNotifications(transaction, [
      {
        userId: post.authorUserId,
        title: `${actorDisplayName(actor)} reacted to your stream post`,
        body: reaction.type.toLowerCase(),
        href: `/posts/${encodeURIComponent(targetId)}`,
        dedupeBy: "title-href"
      }
    ]);
    return { ok: true as const, ...result };
  });
}

export async function notifyFeedCommentReaction(
  actorUserId: string,
  commentId: string,
  existingTransaction?: Prisma.TransactionClient
) {
  const actorId = cleanIdentifier(actorUserId);
  const targetId = cleanIdentifier(commentId);
  if (!actorId || !targetId) return { ok: false as const, error: "Invalid feed interaction." };

  return runNotificationTransaction(existingTransaction, async (transaction) => {
    const [actor, comment, reaction] = await Promise.all([
      loadActor(transaction, actorId),
      transaction.feedComment.findUnique({
        where: { id: targetId },
        select: { authorUserId: true, postId: true }
      }),
      transaction.feedCommentReaction.findUnique({
        where: { commentId_userId: { commentId: targetId, userId: actorId } },
        select: { type: true }
      })
    ]);
    if (!actor || actor.deactivatedAt || !comment || !reaction) {
      return { ok: false as const, error: "Feed interaction was not found." };
    }
    if (reaction.type === "DISLIKE" || comment.authorUserId === actorId) {
      return { ok: true as const, createdCount: 0, deduplicatedCount: 0 };
    }

    const result = await dispatchInteractionNotifications(transaction, [
      {
        userId: comment.authorUserId,
        title: `${actorDisplayName(actor)} reacted to your comment`,
        body: reaction.type.toLowerCase(),
        href: `/posts/${encodeURIComponent(comment.postId)}?commentId=${encodeURIComponent(targetId)}`,
        dedupeBy: "title-href"
      }
    ]);
    return { ok: true as const, ...result };
  });
}

export async function notifyGroupForumPostCreated(
  actorUserId: string,
  postId: string,
  existingTransaction?: Prisma.TransactionClient
) {
  const actorId = cleanIdentifier(actorUserId);
  const targetId = cleanIdentifier(postId);
  if (!actorId || !targetId) return { ok: false as const, error: "Invalid group interaction." };

  return runNotificationTransaction(existingTransaction, async (transaction) => {
    const post = await transaction.groupForumPost.findUnique({
      where: { id: targetId },
      select: { id: true, authorUserId: true, body: true, threadId: true, parentPostId: true }
    });
    if (!post || post.authorUserId !== actorId) {
      return { ok: false as const, error: "Group interaction was not found." };
    }

    const [actor, thread, parent] = await Promise.all([
      loadActor(transaction, actorId),
      transaction.groupForumThread.findUnique({
        where: { id: post.threadId },
        select: { authorUserId: true, group: { select: { slug: true } } }
      }),
      post.parentPostId
        ? transaction.groupForumPost.findUnique({ where: { id: post.parentPostId }, select: { authorUserId: true } })
        : null
    ]);
    if (!actor || actor.deactivatedAt || !thread) {
      return { ok: false as const, error: "Group interaction was not found." };
    }

    const name = actorDisplayName(actor);
    const href = `/groups/${encodeURIComponent(thread.group.slug)}/forum/${encodeURIComponent(post.threadId)}?postId=${encodeURIComponent(post.id)}`;
    const notifications: InteractionNotification[] = [];
    if (thread.authorUserId !== actorId) {
      notifications.push({
        userId: thread.authorUserId,
        title: `${name} replied to your group thread`,
        body: post.body || "Sent a photo reply.",
        href
      });
    }
    if (parent?.authorUserId && parent.authorUserId !== actorId && parent.authorUserId !== thread.authorUserId) {
      notifications.push({
        userId: parent.authorUserId,
        title: `${name} replied to your group post`,
        body: post.body || "Sent a photo reply.",
        href
      });
    }

    const result = await dispatchInteractionNotifications(transaction, notifications);
    return { ok: true as const, ...result };
  });
}

export async function notifyGroupForumThreadReaction(
  actorUserId: string,
  threadId: string,
  existingTransaction?: Prisma.TransactionClient
) {
  const actorId = cleanIdentifier(actorUserId);
  const targetId = cleanIdentifier(threadId);
  if (!actorId || !targetId) return { ok: false as const, error: "Invalid group interaction." };

  return runNotificationTransaction(existingTransaction, async (transaction) => {
    const [actor, thread, reaction] = await Promise.all([
      loadActor(transaction, actorId),
      transaction.groupForumThread.findUnique({
        where: { id: targetId },
        select: { authorUserId: true, group: { select: { slug: true } } }
      }),
      transaction.groupForumThreadReaction.findUnique({
        where: { threadId_userId: { threadId: targetId, userId: actorId } },
        select: { type: true }
      })
    ]);
    if (!actor || actor.deactivatedAt || !thread || !reaction) {
      return { ok: false as const, error: "Group interaction was not found." };
    }
    if (thread.authorUserId === actorId) {
      return { ok: true as const, createdCount: 0, deduplicatedCount: 0 };
    }

    const result = await dispatchInteractionNotifications(transaction, [
      {
        userId: thread.authorUserId,
        title: `${actorDisplayName(actor)} reacted to your group thread`,
        body: reaction.type.toLowerCase(),
        href: `/groups/${encodeURIComponent(thread.group.slug)}/forum/${encodeURIComponent(targetId)}`,
        dedupeBy: "title-href"
      }
    ]);
    return { ok: true as const, ...result };
  });
}

export async function notifyGroupForumPostReaction(
  actorUserId: string,
  postId: string,
  existingTransaction?: Prisma.TransactionClient
) {
  const actorId = cleanIdentifier(actorUserId);
  const targetId = cleanIdentifier(postId);
  if (!actorId || !targetId) return { ok: false as const, error: "Invalid group interaction." };

  return runNotificationTransaction(existingTransaction, async (transaction) => {
    const [actor, post, reaction] = await Promise.all([
      loadActor(transaction, actorId),
      transaction.groupForumPost.findUnique({
        where: { id: targetId },
        select: {
          authorUserId: true,
          threadId: true,
          thread: { select: { group: { select: { slug: true } } } }
        }
      }),
      transaction.groupForumPostReaction.findUnique({
        where: { postId_userId: { postId: targetId, userId: actorId } },
        select: { type: true }
      })
    ]);
    if (!actor || actor.deactivatedAt || !post || !reaction) {
      return { ok: false as const, error: "Group interaction was not found." };
    }
    if (post.authorUserId === actorId) {
      return { ok: true as const, createdCount: 0, deduplicatedCount: 0 };
    }

    const result = await dispatchInteractionNotifications(transaction, [
      {
        userId: post.authorUserId,
        title: `${actorDisplayName(actor)} reacted to your group post`,
        body: reaction.type.toLowerCase(),
        href: `/groups/${encodeURIComponent(post.thread.group.slug)}/forum/${encodeURIComponent(post.threadId)}?postId=${encodeURIComponent(targetId)}`,
        dedupeBy: "title-href"
      }
    ]);
    return { ok: true as const, ...result };
  });
}

export async function getUnreadCounts(userId?: string): Promise<UnreadCounts> {
  const cleanUserId = cleanIdentifier(userId);
  if (!cleanUserId) {
    return { notifications: 0, alerts: 0, mail: 0, messages: 0 };
  }

  try {
    await purgeExpiredReadNotifications(cleanUserId);
    await migratePendingRelationshipRequestAlertsToNotifications(cleanUserId);
    await purgeExpiredAlerts(cleanUserId);
    const [notifications, alerts, messages, mail] = await withNotificationTimeout(
      Promise.all([
        prisma.notification.count({ where: { userId: cleanUserId, readAt: null } }),
        prisma.alert.count({ where: { userId: cleanUserId, readAt: null } }),
        countUnreadChatThreads(cleanUserId),
        countUnreadMail(cleanUserId)
      ]),
      "unread count lookup"
    );

    return { notifications, alerts, mail, messages };
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load unread counts.", {
      userId: cleanUserId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { notifications: 0, alerts: 0, mail: 0, messages: 0 };
  }
}

type NoticePageInput = {
  cursor?: string | null;
  limit?: number;
};

type NoticeCursor = {
  createdAt: Date;
  id: string;
};

const NOTICE_CURSOR_PREFIX = "notice-v1.";

function encodeNoticeCursor(item: { createdAt: Date; id: string }) {
  return `${NOTICE_CURSOR_PREFIX}${Buffer.from(JSON.stringify([item.createdAt.toISOString(), item.id]), "utf8").toString("base64url")}`;
}

function decodeNoticeCursor(value: string): NoticeCursor | null {
  if (!value.startsWith(NOTICE_CURSOR_PREFIX)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(value.slice(NOTICE_CURSOR_PREFIX.length), "base64url").toString("utf8")
    ) as unknown;
    if (!Array.isArray(decoded) || decoded.length !== 2) return null;
    const [rawCreatedAt, rawId] = decoded;
    const id = cleanIdentifier(rawId);
    const createdAt = typeof rawCreatedAt === "string" ? new Date(rawCreatedAt) : new Date(Number.NaN);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function descendingNoticeCursorWhere(cursor: NoticeCursor | null) {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } }
    ]
  };
}

function normalizeNoticePageInput(input: NoticePageInput = {}) {
  const cursor = typeof input.cursor === "string" ? cleanIdentifier(input.cursor) : null;
  const requestedLimit = typeof input.limit === "number" && Number.isFinite(input.limit) ? Math.trunc(input.limit) : DEFAULT_NOTICE_PAGE_SIZE;
  return {
    cursor: cursor || null,
    limit: Math.min(Math.max(requestedLimit, 1), MAX_NOTICE_PAGE_SIZE)
  };
}

export async function listNotificationsPage(userId: string, input: NoticePageInput = {}): Promise<NoticePage> {
  const cleanUserId = cleanIdentifier(userId);
  if (!cleanUserId) return { items: [], nextCursor: null };
  const page = normalizeNoticePageInput(input);

  try {
    await purgeExpiredReadNotifications(cleanUserId);
    await migratePendingRelationshipRequestAlertsToNotifications(cleanUserId);
    const stableCursor = page.cursor ? decodeNoticeCursor(page.cursor) : null;
    const legacyCursor = page.cursor && !page.cursor.startsWith(NOTICE_CURSOR_PREFIX)
      ? await prisma.notification.findFirst({
          where: { id: page.cursor, userId: cleanUserId },
          select: { id: true, createdAt: true }
        })
      : null;
    if (page.cursor && !stableCursor && !legacyCursor) return { items: [], nextCursor: null };
    const cursor = stableCursor ?? legacyCursor;

    const rows = await withNotificationTimeout(
      prisma.notification.findMany({
        where: { userId: cleanUserId, ...descendingNoticeCursorWhere(cursor) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.limit + 1
      }),
      "notification list lookup"
    );
    const hasMore = rows.length > page.limit;
    const notifications = hasMore ? rows.slice(0, page.limit) : rows;
    const familyRequests = await prisma.familyRelationshipRequest.findMany({
      where: {
        targetUserId: cleanUserId,
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
        targetUserId: cleanUserId,
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

    const items = notifications.map<NoticeListItem>((notification) => {
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

    return {
      items,
      nextCursor: hasMore && notifications.at(-1) ? encodeNoticeCursor(notifications.at(-1)!) : null
    };
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list notifications.", {
      userId: cleanUserId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { items: [], nextCursor: null };
  }
}

export async function listNotifications(userId: string) {
  const page = await listNotificationsPage(userId);
  return page.items;
}

export async function listAlertsPage(userId: string, input: NoticePageInput = {}): Promise<NoticePage<AlertListItem>> {
  const cleanUserId = cleanIdentifier(userId);
  if (!cleanUserId) return { items: [], nextCursor: null };
  const page = normalizeNoticePageInput(input);

  try {
    await purgeExpiredAlerts(cleanUserId);
    const stableCursor = page.cursor ? decodeNoticeCursor(page.cursor) : null;
    const legacyCursor = page.cursor && !page.cursor.startsWith(NOTICE_CURSOR_PREFIX)
      ? await prisma.alert.findFirst({
          where: { id: page.cursor, userId: cleanUserId },
          select: { id: true, createdAt: true }
        })
      : null;
    if (page.cursor && !stableCursor && !legacyCursor) return { items: [], nextCursor: null };
    const cursor = stableCursor ?? legacyCursor;

    const rows = await withNotificationTimeout(
      prisma.alert.findMany({
        where: { userId: cleanUserId, readAt: null, ...descendingNoticeCursorWhere(cursor) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.limit + 1
      }),
      "alert list lookup"
    );
    const hasMore = rows.length > page.limit;
    const alerts = hasMore ? rows.slice(0, page.limit) : rows;
    const items = alerts.map<AlertListItem>((alert) => ({
      ...alert,
      familyRequest: null,
      friendRequest: null
    }));
    return {
      items,
      nextCursor: hasMore && alerts.at(-1) ? encodeNoticeCursor(alerts.at(-1)!) : null
    };
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list alerts.", {
      userId: cleanUserId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { items: [], nextCursor: null };
  }
}

export async function listAlerts(userId: string) {
  const page = await listAlertsPage(userId);
  return page.items;
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
  const cleanUserId = cleanIdentifier(userId);
  const cleanNotificationId = cleanIdentifier(notificationId);
  if (!cleanUserId || !cleanNotificationId) return { ok: false as const, updated: 0 };

  const result = await prisma.notification.updateMany({
    where: { id: cleanNotificationId, userId: cleanUserId },
    data: { readAt: new Date() }
  });

  return { ok: result.count === 1, updated: result.count } as const;
}

export async function markAllNotificationsRead(userId: string) {
  const cleanUserId = cleanIdentifier(userId);
  if (!cleanUserId) return { ok: false as const, updated: 0 };

  const result = await prisma.notification.updateMany({
    where: { userId: cleanUserId, readAt: null },
    data: { readAt: new Date() }
  });

  return { ok: true as const, updated: result.count };
}

export async function hideNotifications(userId: string, notificationIds: string[]) {
  const cleanUserId = cleanIdentifier(userId);
  if (!cleanUserId || !Array.isArray(notificationIds)) {
    return { ok: false as const, hidden: 0, error: "Invalid notification selection." };
  }

  const ids = Array.from(
    new Set(notificationIds.filter((id) => typeof id === "string").map(cleanIdentifier).filter(Boolean))
  );
  if (ids.length === 0) return { ok: true as const, hidden: 0 };
  if (ids.length > MAX_HIDE_BATCH_SIZE) {
    return { ok: false as const, hidden: 0, error: `Choose at most ${MAX_HIDE_BATCH_SIZE} notifications.` };
  }

  const result = await prisma.notification.deleteMany({
    where: {
      userId: cleanUserId,
      id: {
        in: ids
      }
    }
  });

  return { ok: true as const, hidden: result.count };
}

export async function markAlertRead(userId: string, alertId: string) {
  const cleanUserId = cleanIdentifier(userId);
  const cleanAlertId = cleanIdentifier(alertId);
  if (!cleanUserId || !cleanAlertId) return { ok: false as const, updated: 0 };

  const result = await prisma.alert.updateMany({
    where: { id: cleanAlertId, userId: cleanUserId },
    data: { readAt: new Date() }
  });

  return { ok: result.count === 1, updated: result.count } as const;
}
