import { randomBytes } from "crypto";
import {
  FeedbackTicketKind,
  FeedbackTicketMessageType,
  FeedbackTicketStatus,
  MediaAssetStatus,
  MediaVisibility,
  NotificationKind,
  Prisma,
  UploadIntentPurpose,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { hashPrivateSignal } from "@/lib/platform/private-signals";
import { isAdminRole } from "@/lib/platform/roles";
import {
  canAddFeedbackMessage,
  canCreateFeedbackTicket,
  canViewFeedbackTicket,
  resolveFeedbackTicketAudience,
  type FeedbackTicketAudience,
  visibleFeedbackMessageTypes
} from "@/modules/feedback-support/authorization";
import { feedbackTypeLabel } from "@/modules/feedback-support/config";
import {
  createFeedbackTicketMessageSchema,
  createFeedbackTicketSchema,
  feedbackScreenshotIntentSchema,
  feedbackTicketBulkActionSchema,
  feedbackTicketListQuerySchema,
  updateFeedbackTicketSchema,
  type FeedbackTicketListQuery
} from "@/modules/feedback-support/types";
import {
  completeUploadIntent,
  consumeVerifiedUploadIntent,
  createUploadIntent
} from "@/modules/media/upload-intent.service";

const MODULE_KEY = "feedback-support";
const ACTIVE_STATUSES = [FeedbackTicketStatus.OPEN, FeedbackTicketStatus.IN_REVIEW] as const;
const RESOLVED_STATUSES = [FeedbackTicketStatus.RESOLVED, FeedbackTicketStatus.CLOSED] as const;
const SENSITIVE_CONTEXT_KEY = /(authorization|cookie|csrf|password|secret|session|token)/i;

const ticketUserSelect = {
  id: true,
  username: true,
  email: true,
  role: true,
  profile: {
    select: {
      displayName: true,
      avatarUrl: true
    }
  }
} satisfies Prisma.UserSelect;

type TicketUser = Prisma.UserGetPayload<{ select: typeof ticketUserSelect }>;
type SafeJson = string | number | boolean | null | SafeJson[] | { [key: string]: SafeJson };
type FeedbackFailureCode =
  | "INVALID"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UPLOAD_FAILED"
  | "FAILED";

class FeedbackTransactionFailure extends Error {
  constructor(
    readonly code: FeedbackFailureCode,
    message: string
  ) {
    super(message);
  }
}

function failure(code: FeedbackFailureCode, error: string) {
  return { ok: false as const, code, error };
}

function createPublicTicketId() {
  return `TS-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function userDisplayName(user: TicketUser | null | undefined) {
  return user?.profile?.displayName?.trim() || user?.username || user?.email || "Unknown user";
}

function isInternalThetaHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "theta-space.net" ||
    normalized.endsWith(".theta-space.net") ||
    normalized === "localhost" ||
    normalized === "127.0.0.1"
  );
}

export function normalizeFeedbackSourceUrl(value?: string) {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim(), "https://theta-space.net");
    if (!isInternalThetaHost(url.hostname)) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      return null;
    }
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_CONTEXT_KEY.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString().slice(0, 2048);
  } catch {
    return null;
  }
}

function safeSourceRoute(value: string | undefined, pageUrl: string | null) {
  const candidate = value?.trim();
  if (candidate?.startsWith("/")) return candidate.slice(0, 600);
  if (!pageUrl) return null;

  try {
    return new URL(pageUrl).pathname.slice(0, 600);
  } catch {
    return null;
  }
}

function sanitizeContextValue(value: unknown, depth = 0): SafeJson | undefined {
  if (depth > 4) return "[truncated]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.slice(0, 1000);
  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((entry) => sanitizeContextValue(entry, depth + 1))
      .filter((entry): entry is SafeJson => entry !== undefined);
  }
  if (typeof value !== "object") return undefined;

  const result: { [key: string]: SafeJson } = {};
  for (const [key, entry] of Object.entries(value).slice(0, 50)) {
    if (SENSITIVE_CONTEXT_KEY.test(key)) continue;
    const clean = sanitizeContextValue(entry, depth + 1);
    if (clean !== undefined) result[key.slice(0, 120)] = clean;
  }
  return result;
}

function sanitizeContext(value: Record<string, unknown> | undefined) {
  return value ? (sanitizeContextValue(value) as Prisma.InputJsonObject) : undefined;
}

async function getActiveUser(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, deactivatedAt: null },
    select: ticketUserSelect
  });
}

async function requireActiveAdmin(userId: string) {
  const user = await getActiveUser(userId);
  return user && isAdminRole(user.role) ? user : null;
}

function feedbackKindWhere(kind: FeedbackTicketKind | undefined): Prisma.FeedbackTicketWhereInput | undefined {
  if (!kind) return undefined;
  if (kind === FeedbackTicketKind.BUG) {
    return { kind: { in: [FeedbackTicketKind.BUG, FeedbackTicketKind.ISSUE_REPORT] } };
  }
  if (kind === FeedbackTicketKind.OTHER) {
    return { kind: { in: [FeedbackTicketKind.OTHER, FeedbackTicketKind.SUPPORT_REQUEST] } };
  }
  return { kind };
}

function statusWhere(status: FeedbackTicketListQuery["status"]): Prisma.FeedbackTicketWhereInput | undefined {
  if (status === "ALL") return undefined;
  return {
    status: {
      in: status === "OPEN" ? [...ACTIVE_STATUSES] : [...RESOLVED_STATUSES]
    }
  };
}

function assignmentWhere(
  assignment: FeedbackTicketListQuery["assignment"],
  adminUserId: string
): Prisma.FeedbackTicketWhereInput | undefined {
  if (assignment === "ALL") return undefined;
  if (assignment === "UNASSIGNED") return { assignedToUserId: null };
  if (assignment === "ME") return { assignedToUserId: adminUserId };
  return {
    assignedToUserId: {
      not: null,
      notIn: [adminUserId]
    }
  };
}

function searchWhere(search: string | undefined): Prisma.FeedbackTicketWhereInput | undefined {
  if (!search) return undefined;
  const contains = { contains: search, mode: Prisma.QueryMode.insensitive } as const;
  return {
    OR: [
      { publicId: contains },
      { title: contains },
      { description: contains },
      { reporterEmail: contains },
      { pageUrl: contains },
      { assignedTo: { is: { username: contains } } },
      { assignedTo: { is: { email: contains } } },
      { assignedTo: { is: { profile: { is: { displayName: contains } } } } },
      { reporter: { is: { username: contains } } },
      { reporter: { is: { email: contains } } },
      { reporter: { is: { profile: { is: { displayName: contains } } } } },
      { messages: { some: { body: contains } } }
    ]
  };
}

function ticketWhere(query: FeedbackTicketListQuery, adminUserId: string): Prisma.FeedbackTicketWhereInput {
  return {
    AND: [
      statusWhere(query.status),
      feedbackKindWhere(query.kind),
      assignmentWhere(query.assignment, adminUserId),
      searchWhere(query.search)
    ].filter((value): value is Prisma.FeedbackTicketWhereInput => Boolean(value))
  };
}

function durationMilliseconds(ticket: { createdAt: Date; resolvedAt: Date | null }, now = new Date()) {
  return Math.max(0, (ticket.resolvedAt ?? now).getTime() - ticket.createdAt.getTime());
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function sortAdminTickets<T extends {
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
  resolvedAt: Date | null;
  status: FeedbackTicketStatus;
  kind: FeedbackTicketKind;
  assignedToUserId: string | null;
  assignedTo: TicketUser | null;
}>(tickets: T[], query: FeedbackTicketListQuery) {
  const now = new Date();
  const direction = query.direction === "asc" ? 1 : -1;
  return tickets.sort((left, right) => {
    const leftClosed = RESOLVED_STATUSES.includes(left.status as (typeof RESOLVED_STATUSES)[number]) ? 1 : 0;
    const rightClosed = RESOLVED_STATUSES.includes(right.status as (typeof RESOLVED_STATUSES)[number]) ? 1 : 0;
    if (leftClosed !== rightClosed) return leftClosed - rightClosed;

    const leftAssigned = Boolean(left.assignedToUserId);
    const rightAssigned = Boolean(right.assignedToUserId);
    if (query.sort === "updatedAt" && leftAssigned !== rightAssigned) {
      return leftAssigned ? 1 : -1;
    }

    let comparison = 0;
    if (query.sort === "createdAt") comparison = left.createdAt.getTime() - right.createdAt.getTime();
    if (query.sort === "updatedAt") comparison = left.lastActivityAt.getTime() - right.lastActivityAt.getTime();
    if (query.sort === "status") comparison = compareText(left.status, right.status);
    if (query.sort === "assignedTo") comparison = compareText(userDisplayName(left.assignedTo), userDisplayName(right.assignedTo));
    if (query.sort === "kind") comparison = compareText(feedbackTypeLabel(left.kind), feedbackTypeLabel(right.kind));
    if (query.sort === "openDuration") comparison = durationMilliseconds(left, now) - durationMilliseconds(right, now);
    if (comparison !== 0) return comparison * direction;
    return (right.updatedAt.getTime() - left.updatedAt.getTime());
  });
}

async function adminNotificationRecipients(transaction: Prisma.TransactionClient, assignedToUserId?: string | null) {
  if (assignedToUserId) return [assignedToUserId];
  const administrators = await transaction.user.findMany({
    where: {
      deactivatedAt: null,
      role: { in: [UserRole.ADMIN, UserRole.GOD] }
    },
    select: { id: true }
  });
  return administrators.map((administrator) => administrator.id);
}

async function notifyAdminsOfNewTicket(ticket: { id: string; publicId: string; title: string }) {
  try {
    const administrators = await prisma.user.findMany({
      where: {
        deactivatedAt: null,
        role: { in: [UserRole.ADMIN, UserRole.GOD] }
      },
      select: { id: true }
    });
    if (administrators.length === 0) return;
    await prisma.notification.createMany({
      data: administrators.map((administrator) => ({
        idempotencyKey: `feedback-created:${ticket.id}:${administrator.id}`,
        userId: administrator.id,
        kind: NotificationKind.GENERAL,
        sourceType: "FeedbackTicket",
        sourceId: ticket.id,
        actionable: true,
        title: `New feedback ${ticket.publicId}`,
        body: ticket.title,
        href: `/admin/settings/tickets?ticket=${encodeURIComponent(ticket.publicId)}`
      })),
      skipDuplicates: true
    });
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not notify administrators about a new feedback ticket.", {
      ticketId: ticket.publicId,
      error: error instanceof Error ? error.message : "unknown"
    });
  }
}

function ticketCreateData(
  parsed: ReturnType<typeof createFeedbackTicketSchema.parse>,
  context: { userId: string; userAgent?: string },
  input: {
    publicId: string;
    pageUrl: string | null;
    sourceRoute: string | null;
    screenshotMediaAssetId?: string;
  }
): Prisma.FeedbackTicketCreateInput {
  const now = new Date();
  return {
    publicId: input.publicId,
    submissionKey: parsed.submissionKey,
    reporter: { connect: { id: context.userId } },
    pageUrl: input.pageUrl,
    sourceRoute: input.sourceRoute,
    sourceEntityType: parsed.sourceEntityType,
    sourceEntityId: parsed.sourceEntityId,
    pageContext: sanitizeContext(parsed.pageContext),
    clientContext: sanitizeContext(parsed.clientContext),
    ...(input.screenshotMediaAssetId
      ? { screenshot: { connect: { id: input.screenshotMediaAssetId } } }
      : {}),
    title: parsed.title,
    description: parsed.description,
    kind: parsed.kind,
    severity: parsed.severity,
    userAgent: hashPrivateSignal(context.userAgent, "feedback:user-agent"),
    diagnostics: sanitizeContext(parsed.diagnostics),
    lastActivityAt: now,
    events: {
      create: {
        actorId: context.userId,
        action: "ticket.created",
        newValue: {
          status: FeedbackTicketStatus.OPEN,
          kind: parsed.kind
        },
        metadata: {
          source: "global-feedback",
          hasScreenshot: Boolean(input.screenshotMediaAssetId)
        }
      }
    },
    readStates: {
      create: {
        userId: context.userId,
        normalReadAt: now
      }
    }
  };
}

async function findSubmissionReplay(userId: string, submissionKey?: string) {
  if (!submissionKey) return null;
  return prisma.feedbackTicket.findFirst({
    where: { reporterUserId: userId, submissionKey }
  });
}

export async function createFeedbackTicket(input: unknown, context: { userId?: string; userAgent?: string } = {}) {
  if (!canCreateFeedbackTicket(context.userId)) {
    return failure("UNAUTHENTICATED", "Login is required to create feedback.");
  }

  const parsed = createFeedbackTicketSchema.safeParse(input);
  if (!parsed.success) {
    return failure("INVALID", parsed.error.issues[0]?.message ?? "Invalid feedback.");
  }

  const replay = await findSubmissionReplay(context.userId, parsed.data.submissionKey);
  if (replay) return { ok: true as const, ticket: replay, replayed: true as const };

  const publicId = createPublicTicketId();
  const pageUrl = normalizeFeedbackSourceUrl(parsed.data.pageUrl);
  const sourceRoute = safeSourceRoute(parsed.data.sourceRoute, pageUrl);

  try {
    let ticket;
    if (parsed.data.screenshotUploadIntentId) {
      const consumed = await consumeVerifiedUploadIntent({
        ownerUserId: context.userId,
        intentId: parsed.data.screenshotUploadIntentId,
        purpose: UploadIntentPurpose.FEEDBACK_SCREENSHOT,
        consume: async (transaction, intent) => {
          const screenshot = await transaction.mediaAsset.create({
            data: {
              ownerUserId: context.userId!,
              storageKey: intent.storageKey,
              mimeType: intent.observedMimeType ?? intent.declaredMimeType,
              sizeBytes: intent.observedSizeBytes ?? intent.declaredSizeBytes,
              originalName: `feedback-${publicId.toLowerCase()}.${(intent.observedMimeType ?? intent.declaredMimeType).split("/")[1] ?? "jpg"}`,
              status: MediaAssetStatus.READY,
              visibility: MediaVisibility.PRIVATE,
              metadata: {
                purpose: "feedback-screenshot",
                uploadIntentId: intent.id
              }
            }
          });
          return transaction.feedbackTicket.create({
            data: ticketCreateData(parsed.data, { userId: context.userId!, userAgent: context.userAgent }, {
              publicId,
              pageUrl,
              sourceRoute,
              screenshotMediaAssetId: screenshot.id
            })
          });
        }
      });
      if (!consumed.ok) {
        const duplicate = await findSubmissionReplay(context.userId, parsed.data.submissionKey);
        if (duplicate) return { ok: true as const, ticket: duplicate, replayed: true as const };
        return failure("UPLOAD_FAILED", consumed.error);
      }
      ticket = consumed.value;
    } else {
      ticket = await prisma.feedbackTicket.create({
        data: ticketCreateData(parsed.data, { userId: context.userId, userAgent: context.userAgent }, {
          publicId,
          pageUrl,
          sourceRoute
        })
      });
    }

    await Promise.all([
      diagnostics.info(MODULE_KEY, "Feedback ticket created.", {
        ticketId: ticket.publicId,
        reporterUserId: context.userId,
        pageUrl: ticket.pageUrl,
        hasScreenshot: Boolean(ticket.screenshotMediaAssetId)
      }),
      notifyAdminsOfNewTicket(ticket)
    ]);

    return { ok: true as const, ticket, replayed: false as const };
  } catch (error) {
    if (
      parsed.data.submissionKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const duplicate = await findSubmissionReplay(context.userId, parsed.data.submissionKey);
      if (duplicate) return { ok: true as const, ticket: duplicate, replayed: true as const };
    }
    await diagnostics.error(MODULE_KEY, "Feedback ticket creation failed.", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return failure("FAILED", "Could not submit feedback.");
  }
}

export async function createFeedbackScreenshotUploadIntent(userId: string, input: unknown) {
  const parsed = feedbackScreenshotIntentSchema.safeParse(input);
  if (!parsed.success) return failure("INVALID", parsed.error.issues[0]?.message ?? "Invalid screenshot.");
  return createUploadIntent(userId, {
    purpose: UploadIntentPurpose.FEEDBACK_SCREENSHOT,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
    checksumSha256: parsed.data.checksumSha256,
    visibility: MediaVisibility.PRIVATE
  });
}

export async function completeFeedbackScreenshotUpload(userId: string, input: unknown) {
  const result = await completeUploadIntent(userId, input);
  if (!result.ok) return result;
  if (result.intent.purpose !== UploadIntentPurpose.FEEDBACK_SCREENSHOT) {
    return failure("INVALID", "That upload is not a feedback screenshot.");
  }
  return result;
}

export async function listUserFeedbackTickets(userId: string) {
  const user = await getActiveUser(userId);
  if (!user) return failure("UNAUTHENTICATED", "Login required.");
  const tickets = await prisma.feedbackTicket.findMany({
    where: { reporterUserId: userId },
    orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
    select: {
      publicId: true,
      title: true,
      kind: true,
      status: true,
      createdAt: true,
      lastActivityAt: true,
      resolvedAt: true,
      screenshotMediaAssetId: true,
      messages: {
        where: {
          type: FeedbackTicketMessageType.NORMAL,
          senderUserId: { not: userId }
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true }
      },
      readStates: {
        where: { userId },
        take: 1,
        select: { normalReadAt: true }
      }
    }
  });

  return {
    ok: true as const,
    tickets: tickets.map((ticket) => ({
      publicId: ticket.publicId,
      subject: ticket.title,
      kind: ticket.kind,
      kindLabel: feedbackTypeLabel(ticket.kind),
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
      lastActivityAt: ticket.lastActivityAt.toISOString(),
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      hasScreenshot: Boolean(ticket.screenshotMediaAssetId),
      unread: Boolean(
        ticket.messages[0] &&
        (!ticket.readStates[0]?.normalReadAt ||
          ticket.messages[0].createdAt > ticket.readStates[0].normalReadAt)
      )
    }))
  };
}

export async function listAdminFeedbackTickets(adminUserId: string, input: unknown) {
  const administrator = await requireActiveAdmin(adminUserId);
  if (!administrator) return failure("FORBIDDEN", "Administrator access required.");
  const parsed = feedbackTicketListQuerySchema.safeParse(input);
  if (!parsed.success) return failure("INVALID", parsed.error.issues[0]?.message ?? "Invalid ticket filters.");
  const query = parsed.data;
  const where = ticketWhere(query, adminUserId);

  const [matchingTickets, openCount, unassignedCount, assignedToMeCount] = await Promise.all([
    prisma.feedbackTicket.findMany({
      where,
      take: 1000,
      include: {
        reporter: { select: ticketUserSelect },
        assignedTo: { select: ticketUserSelect },
        messages: {
          where: { senderUserId: { not: adminUserId } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { type: true, createdAt: true }
        },
        readStates: {
          where: { userId: adminUserId },
          take: 1,
          select: { normalReadAt: true, internalReadAt: true }
        },
        _count: {
          select: {
            messages: {
              where: { type: FeedbackTicketMessageType.INTERNAL }
            }
          }
        }
      }
    }),
    prisma.feedbackTicket.count({ where: { status: { in: [...ACTIVE_STATUSES] } } }),
    prisma.feedbackTicket.count({
      where: { status: { in: [...ACTIVE_STATUSES] }, assignedToUserId: null }
    }),
    prisma.feedbackTicket.count({
      where: { status: { in: [...ACTIVE_STATUSES] }, assignedToUserId: adminUserId }
    })
  ]);

  const sorted = sortAdminTickets(matchingTickets, query);
  const start = (query.page - 1) * query.pageSize;
  const page = sorted.slice(start, start + query.pageSize);

  return {
    ok: true as const,
    summary: {
      open: openCount,
      unassigned: unassignedCount,
      assignedToMe: assignedToMeCount
    },
    total: matchingTickets.length,
    page: query.page,
    pageSize: query.pageSize,
    tickets: page.map((ticket) => {
      const readState = ticket.readStates[0];
      const latestUnreadMessage = ticket.messages[0];
      const unread = Boolean(
        latestUnreadMessage &&
        (latestUnreadMessage.type === FeedbackTicketMessageType.INTERNAL
          ? !readState?.internalReadAt || latestUnreadMessage.createdAt > readState.internalReadAt
          : !readState?.normalReadAt || latestUnreadMessage.createdAt > readState.normalReadAt)
      );
      return {
        id: ticket.id,
        publicId: ticket.publicId,
        version: ticket.version,
        kind: ticket.kind,
        kindLabel: feedbackTypeLabel(ticket.kind),
        subject: ticket.title,
        description: ticket.description,
        severity: ticket.severity,
        status: ticket.status,
        reporter: ticket.reporter
          ? {
              id: ticket.reporter.id,
              name: userDisplayName(ticket.reporter),
              username: ticket.reporter.username,
              email: ticket.reporter.email
            }
          : {
              id: null,
              name: ticket.reporterEmail ?? "Unknown user",
              username: null,
              email: ticket.reporterEmail
            },
        assignedTo: ticket.assignedTo
          ? {
              id: ticket.assignedTo.id,
              name: userDisplayName(ticket.assignedTo),
              username: ticket.assignedTo.username
            }
          : null,
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        lastActivityAt: ticket.lastActivityAt.toISOString(),
        resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
        openDurationMs: durationMilliseconds(ticket),
        hasInternalNotes: ticket._count.messages > 0,
        unread,
        assignedToMe: ticket.assignedToUserId === adminUserId
      };
    })
  };
}

function serializeTicketMessage(message: {
  id: string;
  type: FeedbackTicketMessageType;
  body: string;
  createdAt: Date;
  sender: TicketUser | null;
}) {
  return {
    id: message.id,
    type: message.type,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    sender: message.sender
      ? {
          id: message.sender.id,
          name: userDisplayName(message.sender),
          username: message.sender.username,
          isAdmin: isAdminRole(message.sender.role)
        }
      : null
  };
}

export async function getFeedbackTicket(
  viewerUserId: string,
  publicId: string,
  requestedAudience: FeedbackTicketAudience = "creator"
) {
  const viewer = await getActiveUser(viewerUserId);
  if (!viewer) return failure("UNAUTHENTICATED", "Login required.");
  const audience = resolveFeedbackTicketAudience(viewer.role, requestedAudience);
  if (!audience) return failure("FORBIDDEN", "Administrator access required.");
  const isAdminAudience = audience === "admin";
  const ticket = await prisma.feedbackTicket.findFirst({
    where: {
      publicId,
      ...(isAdminAudience ? {} : { reporterUserId: viewerUserId })
    },
    include: {
      reporter: { select: ticketUserSelect },
      assignedTo: { select: ticketUserSelect },
      resolvedBy: { select: ticketUserSelect },
      screenshot: {
        select: {
          id: true,
          mimeType: true,
          sizeBytes: true,
          originalName: true
        }
      },
      messages: {
        where: {
          type: {
            in: isAdminAudience
              ? visibleFeedbackMessageTypes(viewer.role)
              : [FeedbackTicketMessageType.NORMAL]
          }
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          type: true,
          body: true,
          createdAt: true,
          sender: { select: ticketUserSelect }
        }
      },
      events: isAdminAudience
        ? {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: { actor: { select: ticketUserSelect } }
          }
        : false
    }
  });
  if (!ticket) return failure("NOT_FOUND", "Ticket not found.");

  const now = new Date();
  await prisma.feedbackTicketReadState.upsert({
    where: {
      ticketId_userId: {
        ticketId: ticket.id,
        userId: viewerUserId
      }
    },
    create: {
      ticketId: ticket.id,
      userId: viewerUserId,
      normalReadAt: now,
      ...(isAdminAudience ? { internalReadAt: now } : {})
    },
    update: {
      normalReadAt: now,
      ...(isAdminAudience ? { internalReadAt: now } : {})
    }
  });

  const common = {
    publicId: ticket.publicId,
    version: ticket.version,
    kind: ticket.kind,
    kindLabel: feedbackTypeLabel(ticket.kind),
    subject: ticket.title,
    description: ticket.description,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    lastActivityAt: ticket.lastActivityAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    openDurationMs: durationMilliseconds(ticket),
    sourceUrl: ticket.pageUrl,
    sourceRoute: ticket.sourceRoute,
    screenshot: ticket.screenshot
      ? {
          id: ticket.screenshot.id,
          mimeType: ticket.screenshot.mimeType,
          sizeBytes: ticket.screenshot.sizeBytes.toString(),
          fileName: ticket.screenshot.originalName,
          href: `/api/media/assets/${encodeURIComponent(ticket.screenshot.id)}`
        }
      : null,
    messages: ticket.messages.map(serializeTicketMessage)
  };

  if (!isAdminAudience) {
    return {
      ok: true as const,
      audience: "creator" as const,
      ticket: common
    };
  }

  const adminEvents = ticket.events as Array<
    (typeof ticket.events)[number] & { actor: TicketUser | null }
  >;

  return {
    ok: true as const,
    audience: "admin" as const,
    ticket: {
      ...common,
      severity: ticket.severity,
      reporter: ticket.reporter
        ? {
            id: ticket.reporter.id,
            name: userDisplayName(ticket.reporter),
            username: ticket.reporter.username,
            email: ticket.reporter.email
          }
        : null,
      assignedTo: ticket.assignedTo
        ? {
            id: ticket.assignedTo.id,
            name: userDisplayName(ticket.assignedTo),
            username: ticket.assignedTo.username
          }
        : null,
      resolvedBy: ticket.resolvedBy
        ? {
            id: ticket.resolvedBy.id,
            name: userDisplayName(ticket.resolvedBy)
          }
        : null,
      resolution: ticket.resolution,
      sourceEntityType: ticket.sourceEntityType,
      sourceEntityId: ticket.sourceEntityId,
      pageContext: ticket.pageContext,
      clientContext: ticket.clientContext,
      diagnostics: ticket.diagnostics,
      history: Array.isArray(adminEvents)
        ? adminEvents.map((event) => ({
            id: event.id,
            action: event.action,
            oldValue: event.oldValue,
            newValue: event.newValue,
            metadata: event.metadata,
            createdAt: event.createdAt.toISOString(),
            actor: event.actor
              ? {
                  id: event.actor.id,
                  name: userDisplayName(event.actor)
                }
              : null
          }))
        : []
    }
  };
}

async function createTicketNotifications(
  transaction: Prisma.TransactionClient,
  input: {
    ticket: {
      id: string;
      publicId: string;
      title: string;
      reporterUserId: string | null;
      assignedToUserId: string | null;
    };
    senderUserId: string;
    senderIsAdmin: boolean;
    messageId: string;
    messageBody: string;
  }
) {
  if (input.senderIsAdmin) {
    if (!input.ticket.reporterUserId || input.ticket.reporterUserId === input.senderUserId) return;
    await transaction.notification.create({
      data: {
        idempotencyKey: `feedback-message:${input.messageId}:${input.ticket.reporterUserId}`,
        userId: input.ticket.reporterUserId,
        kind: NotificationKind.GENERAL,
        sourceType: "FeedbackTicketMessage",
        sourceId: input.messageId,
        actionable: true,
        title: `Reply on ${input.ticket.publicId}`,
        body: input.messageBody.slice(0, 240),
        href: `/feedback/tickets/${encodeURIComponent(input.ticket.publicId)}`
      }
    });
    return;
  }

  const recipientIds = await adminNotificationRecipients(transaction, input.ticket.assignedToUserId);
  if (recipientIds.length === 0) return;
  await transaction.notification.createMany({
    data: recipientIds
      .filter((recipientId) => recipientId !== input.senderUserId)
      .map((recipientId) => ({
        idempotencyKey: `feedback-message:${input.messageId}:${recipientId}`,
        userId: recipientId,
        kind: NotificationKind.GENERAL,
        sourceType: "FeedbackTicketMessage",
        sourceId: input.messageId,
        actionable: true,
        title: `Reply on ${input.ticket.publicId}`,
        body: input.messageBody.slice(0, 240),
        href: `/admin/settings/tickets?ticket=${encodeURIComponent(input.ticket.publicId)}`
      })),
    skipDuplicates: true
  });
}

export async function addFeedbackTicketMessage(actorUserId: string, publicId: string, input: unknown) {
  const actor = await getActiveUser(actorUserId);
  if (!actor) return failure("UNAUTHENTICATED", "Login required.");
  const parsed = createFeedbackTicketMessageSchema.safeParse(input);
  if (!parsed.success) return failure("INVALID", parsed.error.issues[0]?.message ?? "Invalid message.");
  const actorIsAdmin = isAdminRole(actor.role);
  if (!actorIsAdmin && parsed.data.type === FeedbackTicketMessageType.INTERNAL) {
    return failure("FORBIDDEN", "Internal notes are only available to administrators.");
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const ticket = await transaction.feedbackTicket.findUnique({
        where: { publicId },
        select: {
          id: true,
          publicId: true,
          title: true,
          reporterUserId: true,
          assignedToUserId: true,
          status: true,
          resolvedAt: true,
          resolvedByUserId: true,
          resolution: true,
          version: true
        }
      });
      if (!ticket) throw new FeedbackTransactionFailure("NOT_FOUND", "Ticket not found.");
      if (!canViewFeedbackTicket({
        viewerUserId: actorUserId,
        viewerRole: actor.role,
        reporterUserId: ticket.reporterUserId
      })) {
        throw new FeedbackTransactionFailure("NOT_FOUND", "Ticket not found.");
      }
      if (!canAddFeedbackMessage({
        viewerUserId: actorUserId,
        viewerRole: actor.role,
        reporterUserId: ticket.reporterUserId,
        messageType: parsed.data.type
      })) {
        throw new FeedbackTransactionFailure("FORBIDDEN", "You cannot add that message to this ticket.");
      }

      const existing = await transaction.feedbackTicketMessage.findUnique({
        where: { idempotencyKey: parsed.data.idempotencyKey }
      });
      if (existing) {
        if (
          existing.ticketId === ticket.id &&
          existing.senderUserId === actorUserId &&
          existing.type === parsed.data.type &&
          existing.body === parsed.data.body
        ) {
          return { message: existing, replayed: true as const };
        }
        throw new FeedbackTransactionFailure("CONFLICT", "That message request was already used.");
      }

      const now = new Date();
      const reopensTicket = !actorIsAdmin && RESOLVED_STATUSES.includes(ticket.status as (typeof RESOLVED_STATUSES)[number]);
      const updated = await transaction.feedbackTicket.updateMany({
        where: { id: ticket.id, version: ticket.version },
        data: {
          ...(reopensTicket
            ? {
                status: FeedbackTicketStatus.OPEN,
                resolvedAt: null,
                resolvedByUserId: null,
                resolution: null
              }
            : {}),
          lastActivityAt: now,
          version: { increment: 1 }
        }
      });
      if (updated.count !== 1) {
        throw new FeedbackTransactionFailure("CONFLICT", "This ticket changed. Refresh it and try again.");
      }

      const message = await transaction.feedbackTicketMessage.create({
        data: {
          ticketId: ticket.id,
          senderUserId: actorUserId,
          type: parsed.data.type,
          body: parsed.data.body,
          idempotencyKey: parsed.data.idempotencyKey
        }
      });
      await transaction.feedbackTicketEvent.createMany({
        data: [
          {
            ticketId: ticket.id,
            actorId: actorUserId,
            action: parsed.data.type === FeedbackTicketMessageType.INTERNAL ? "message.internal.created" : "message.normal.created",
            metadata: { messageId: message.id }
          },
          ...(reopensTicket
            ? [{
                ticketId: ticket.id,
                actorId: actorUserId,
                action: "ticket.reopened",
                oldValue: { status: ticket.status, resolvedAt: ticket.resolvedAt?.toISOString() ?? null },
                newValue: { status: FeedbackTicketStatus.OPEN },
                metadata: { reason: "creator-reply" }
              }]
            : [])
        ]
      });
      await transaction.feedbackTicketReadState.upsert({
        where: { ticketId_userId: { ticketId: ticket.id, userId: actorUserId } },
        create: {
          ticketId: ticket.id,
          userId: actorUserId,
          normalReadAt: now,
          ...(actorIsAdmin ? { internalReadAt: now } : {})
        },
        update: {
          ...(parsed.data.type === FeedbackTicketMessageType.INTERNAL
            ? { internalReadAt: now }
            : { normalReadAt: now })
        }
      });
      if (parsed.data.type === FeedbackTicketMessageType.NORMAL) {
        await createTicketNotifications(transaction, {
          ticket,
          senderUserId: actorUserId,
          senderIsAdmin: actorIsAdmin,
          messageId: message.id,
          messageBody: message.body
        });
      }
      return { message, replayed: false as const };
    });
    return {
      ok: true as const,
      message: {
        id: result.message.id,
        type: result.message.type,
        body: result.message.body,
        createdAt: result.message.createdAt.toISOString()
      },
      replayed: result.replayed
    };
  } catch (error) {
    if (error instanceof FeedbackTransactionFailure) return failure(error.code, error.message);
    await diagnostics.error(MODULE_KEY, "Could not add a feedback ticket message.", {
      publicId,
      actorUserId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return failure("FAILED", "Could not send the message.");
  }
}

function adminChangeEventData(input: {
  ticketId: string;
  actorId: string;
  action: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonObject;
}): Prisma.FeedbackTicketEventCreateManyInput {
  return input;
}

export async function updateAdminFeedbackTicket(adminUserId: string, publicId: string, input: unknown) {
  const administrator = await requireActiveAdmin(adminUserId);
  if (!administrator) return failure("FORBIDDEN", "Administrator access required.");
  const parsed = updateFeedbackTicketSchema.safeParse(input);
  if (!parsed.success) return failure("INVALID", parsed.error.issues[0]?.message ?? "Invalid ticket update.");
  if (parsed.data.finalMessage && !parsed.data.messageIdempotencyKey) {
    return failure("INVALID", "A message request ID is required for the final reply.");
  }
  if (parsed.data.finalMessage && parsed.data.status !== FeedbackTicketStatus.RESOLVED) {
    return failure("INVALID", "A final reply can only be sent while resolving a ticket.");
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const ticket = await transaction.feedbackTicket.findUnique({
        where: { publicId },
        select: {
          id: true,
          publicId: true,
          title: true,
          reporterUserId: true,
          assignedToUserId: true,
          kind: true,
          status: true,
          resolvedAt: true,
          resolvedByUserId: true,
          resolution: true,
          version: true
        }
      });
      if (!ticket) throw new FeedbackTransactionFailure("NOT_FOUND", "Ticket not found.");
      if (ticket.version !== parsed.data.expectedVersion) {
        throw new FeedbackTransactionFailure("CONFLICT", "This ticket changed. Refresh it and try again.");
      }

      if (parsed.data.assignedToUserId) {
        const assignee = await transaction.user.findFirst({
          where: {
            id: parsed.data.assignedToUserId,
            deactivatedAt: null,
            role: { in: [UserRole.ADMIN, UserRole.GOD] }
          },
          select: { id: true }
        });
        if (!assignee) throw new FeedbackTransactionFailure("INVALID", "Choose an active administrator.");
      }

      const now = new Date();
      const events: Prisma.FeedbackTicketEventCreateManyInput[] = [];
      const data: Prisma.FeedbackTicketUncheckedUpdateManyInput = {
        lastActivityAt: now,
        version: { increment: 1 }
      };

      if (
        parsed.data.assignedToUserId !== undefined &&
        parsed.data.assignedToUserId !== ticket.assignedToUserId
      ) {
        data.assignedToUserId = parsed.data.assignedToUserId;
        events.push(adminChangeEventData({
          ticketId: ticket.id,
          actorId: adminUserId,
          action: ticket.assignedToUserId ? "ticket.routed" : "ticket.assigned",
          oldValue: { assignedToUserId: ticket.assignedToUserId },
          newValue: { assignedToUserId: parsed.data.assignedToUserId }
        }));
      }
      if (parsed.data.kind && parsed.data.kind !== ticket.kind) {
        data.kind = parsed.data.kind;
        events.push(adminChangeEventData({
          ticketId: ticket.id,
          actorId: adminUserId,
          action: "ticket.kind.changed",
          oldValue: { kind: ticket.kind },
          newValue: { kind: parsed.data.kind }
        }));
      }
      if (parsed.data.status === FeedbackTicketStatus.RESOLVED && ticket.status !== FeedbackTicketStatus.RESOLVED) {
        data.status = FeedbackTicketStatus.RESOLVED;
        data.resolvedAt = now;
        data.resolvedByUserId = adminUserId;
        data.resolution = parsed.data.resolution;
        events.push(adminChangeEventData({
          ticketId: ticket.id,
          actorId: adminUserId,
          action: "ticket.resolved",
          oldValue: { status: ticket.status },
          newValue: { status: FeedbackTicketStatus.RESOLVED, resolvedAt: now.toISOString() }
        }));
      }
      if (parsed.data.status === FeedbackTicketStatus.OPEN && RESOLVED_STATUSES.includes(ticket.status as (typeof RESOLVED_STATUSES)[number])) {
        data.status = FeedbackTicketStatus.OPEN;
        data.resolvedAt = null;
        data.resolvedByUserId = null;
        data.resolution = null;
        events.push(adminChangeEventData({
          ticketId: ticket.id,
          actorId: adminUserId,
          action: "ticket.reopened",
          oldValue: {
            status: ticket.status,
            resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
            resolvedByUserId: ticket.resolvedByUserId,
            resolution: ticket.resolution
          },
          newValue: { status: FeedbackTicketStatus.OPEN }
        }));
      }

      if (events.length === 0) {
        throw new FeedbackTransactionFailure("INVALID", "The ticket already has those values.");
      }

      const changed = await transaction.feedbackTicket.updateMany({
        where: { id: ticket.id, version: parsed.data.expectedVersion },
        data
      });
      if (changed.count !== 1) {
        throw new FeedbackTransactionFailure("CONFLICT", "This ticket changed. Refresh it and try again.");
      }
      await transaction.feedbackTicketEvent.createMany({ data: events });

      let finalMessageId: string | null = null;
      if (parsed.data.finalMessage && parsed.data.messageIdempotencyKey) {
        const finalMessage = await transaction.feedbackTicketMessage.create({
          data: {
            ticketId: ticket.id,
            senderUserId: adminUserId,
            type: FeedbackTicketMessageType.NORMAL,
            body: parsed.data.finalMessage,
            idempotencyKey: parsed.data.messageIdempotencyKey
          }
        });
        finalMessageId = finalMessage.id;
        await createTicketNotifications(transaction, {
          ticket,
          senderUserId: adminUserId,
          senderIsAdmin: true,
          messageId: finalMessage.id,
          messageBody: finalMessage.body
        });
      } else if (
        parsed.data.status === FeedbackTicketStatus.RESOLVED &&
        ticket.reporterUserId
      ) {
        await transaction.notification.create({
          data: {
            idempotencyKey: `feedback-resolved:${ticket.id}:${parsed.data.expectedVersion + 1}`,
            userId: ticket.reporterUserId,
            kind: NotificationKind.GENERAL,
            sourceType: "FeedbackTicket",
            sourceId: ticket.id,
            actionable: true,
            title: `${ticket.publicId} was resolved`,
            body: parsed.data.resolution?.slice(0, 240) || ticket.title,
            href: `/feedback/tickets/${encodeURIComponent(ticket.publicId)}`
          }
        });
      }

      if (
        parsed.data.assignedToUserId &&
        parsed.data.assignedToUserId !== adminUserId &&
        parsed.data.assignedToUserId !== ticket.assignedToUserId
      ) {
        await transaction.notification.create({
          data: {
            idempotencyKey: `feedback-assigned:${ticket.id}:${parsed.data.expectedVersion + 1}:${parsed.data.assignedToUserId}`,
            userId: parsed.data.assignedToUserId,
            kind: NotificationKind.GENERAL,
            sourceType: "FeedbackTicket",
            sourceId: ticket.id,
            actionable: true,
            title: `${ticket.publicId} was assigned to you`,
            body: ticket.title,
            href: `/admin/settings/tickets?ticket=${encodeURIComponent(ticket.publicId)}`
          }
        });
      }

      await transaction.feedbackTicketReadState.upsert({
        where: { ticketId_userId: { ticketId: ticket.id, userId: adminUserId } },
        create: { ticketId: ticket.id, userId: adminUserId, normalReadAt: now, internalReadAt: now },
        update: { normalReadAt: now, internalReadAt: now }
      });
      const updatedTicket = await transaction.feedbackTicket.findUniqueOrThrow({
        where: { id: ticket.id }
      });
      return { ticket: updatedTicket, finalMessageId };
    });
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof FeedbackTransactionFailure) return failure(error.code, error.message);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return failure("CONFLICT", "That final reply was already sent.");
    }
    await diagnostics.error(MODULE_KEY, "Could not update a feedback ticket.", {
      publicId,
      adminUserId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return failure("FAILED", "Could not update the ticket.");
  }
}

export async function applyAdminFeedbackBulkAction(adminUserId: string, input: unknown) {
  const administrator = await requireActiveAdmin(adminUserId);
  if (!administrator) return failure("FORBIDDEN", "Administrator access required.");
  const parsed = feedbackTicketBulkActionSchema.safeParse(input);
  if (!parsed.success) return failure("INVALID", parsed.error.issues[0]?.message ?? "Invalid bulk action.");

  const assigneeUserId =
    parsed.data.action === "ASSIGN_TO_ME"
      ? adminUserId
      : parsed.data.action === "ASSIGN"
        ? parsed.data.assigneeUserId
        : undefined;

  try {
    const changed = await prisma.$transaction(async (transaction) => {
      if (assigneeUserId) {
        const assignee = await transaction.user.findFirst({
          where: {
            id: assigneeUserId,
            deactivatedAt: null,
            role: { in: [UserRole.ADMIN, UserRole.GOD] }
          },
          select: { id: true }
        });
        if (!assignee) throw new FeedbackTransactionFailure("INVALID", "Choose an active administrator.");
      }

      const tickets = await transaction.feedbackTicket.findMany({
        where: { publicId: { in: parsed.data.ticketIds } },
        select: {
          id: true,
          publicId: true,
          title: true,
          reporterUserId: true,
          assignedToUserId: true,
          kind: true,
          status: true,
          version: true
        }
      });
      if (tickets.length !== parsed.data.ticketIds.length) {
        throw new FeedbackTransactionFailure("NOT_FOUND", "One or more tickets were not found.");
      }
      const now = new Date();
      const updatedPublicIds: string[] = [];

      for (const ticket of tickets) {
        const expectedVersion = parsed.data.expectedVersions[ticket.publicId];
        if (!expectedVersion || expectedVersion !== ticket.version) {
          throw new FeedbackTransactionFailure("CONFLICT", `${ticket.publicId} changed. Refresh the list and try again.`);
        }

        const data: Prisma.FeedbackTicketUncheckedUpdateManyInput = {
          lastActivityAt: now,
          version: { increment: 1 }
        };
        let event: Prisma.FeedbackTicketEventCreateManyInput;

        if (parsed.data.action === "ASSIGN_TO_ME" || parsed.data.action === "ASSIGN") {
          if (ticket.assignedToUserId === assigneeUserId) continue;
          data.assignedToUserId = assigneeUserId;
          event = adminChangeEventData({
            ticketId: ticket.id,
            actorId: adminUserId,
            action: ticket.assignedToUserId ? "ticket.routed" : "ticket.assigned",
            oldValue: { assignedToUserId: ticket.assignedToUserId },
            newValue: { assignedToUserId: assigneeUserId ?? null },
            metadata: { bulk: true }
          });
        } else if (parsed.data.action === "RESOLVE") {
          if (RESOLVED_STATUSES.includes(ticket.status as (typeof RESOLVED_STATUSES)[number])) continue;
          data.status = FeedbackTicketStatus.RESOLVED;
          data.resolvedAt = now;
          data.resolvedByUserId = adminUserId;
          data.resolution = parsed.data.resolution;
          event = adminChangeEventData({
            ticketId: ticket.id,
            actorId: adminUserId,
            action: "ticket.resolved",
            oldValue: { status: ticket.status },
            newValue: { status: FeedbackTicketStatus.RESOLVED, resolvedAt: now.toISOString() },
            metadata: { bulk: true }
          });
        } else if (parsed.data.action === "REOPEN") {
          if (!RESOLVED_STATUSES.includes(ticket.status as (typeof RESOLVED_STATUSES)[number])) continue;
          data.status = FeedbackTicketStatus.OPEN;
          data.resolvedAt = null;
          data.resolvedByUserId = null;
          data.resolution = null;
          event = adminChangeEventData({
            ticketId: ticket.id,
            actorId: adminUserId,
            action: "ticket.reopened",
            oldValue: { status: ticket.status },
            newValue: { status: FeedbackTicketStatus.OPEN },
            metadata: { bulk: true }
          });
        } else {
          if (!parsed.data.kind || parsed.data.kind === ticket.kind) continue;
          data.kind = parsed.data.kind;
          event = adminChangeEventData({
            ticketId: ticket.id,
            actorId: adminUserId,
            action: "ticket.kind.changed",
            oldValue: { kind: ticket.kind },
            newValue: { kind: parsed.data.kind },
            metadata: { bulk: true }
          });
        }

        const updated = await transaction.feedbackTicket.updateMany({
          where: { id: ticket.id, version: expectedVersion },
          data
        });
        if (updated.count !== 1) {
          throw new FeedbackTransactionFailure("CONFLICT", `${ticket.publicId} changed. Refresh the list and try again.`);
        }
        await transaction.feedbackTicketEvent.create({ data: event });
        updatedPublicIds.push(ticket.publicId);

        if (
          (parsed.data.action === "ASSIGN_TO_ME" || parsed.data.action === "ASSIGN") &&
          assigneeUserId &&
          assigneeUserId !== adminUserId
        ) {
          await transaction.notification.create({
            data: {
              idempotencyKey: `feedback-assigned:${ticket.id}:${expectedVersion + 1}:${assigneeUserId}`,
              userId: assigneeUserId,
              kind: NotificationKind.GENERAL,
              sourceType: "FeedbackTicket",
              sourceId: ticket.id,
              actionable: true,
              title: `${ticket.publicId} was assigned to you`,
              body: ticket.title,
              href: `/admin/settings/tickets?ticket=${encodeURIComponent(ticket.publicId)}`
            }
          });
        }
        if (parsed.data.action === "RESOLVE" && ticket.reporterUserId) {
          await transaction.notification.create({
            data: {
              idempotencyKey: `feedback-resolved:${ticket.id}:${expectedVersion + 1}`,
              userId: ticket.reporterUserId,
              kind: NotificationKind.GENERAL,
              sourceType: "FeedbackTicket",
              sourceId: ticket.id,
              actionable: true,
              title: `${ticket.publicId} was resolved`,
              body: parsed.data.resolution?.slice(0, 240) || ticket.title,
              href: `/feedback/tickets/${encodeURIComponent(ticket.publicId)}`
            }
          });
        }
      }
      return updatedPublicIds;
    });
    return { ok: true as const, ticketIds: changed };
  } catch (error) {
    if (error instanceof FeedbackTransactionFailure) return failure(error.code, error.message);
    await diagnostics.error(MODULE_KEY, "Could not apply a feedback ticket bulk action.", {
      adminUserId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return failure("FAILED", "Could not update the selected tickets.");
  }
}

export async function listFeedbackTicketAssignees(adminUserId: string) {
  const administrator = await requireActiveAdmin(adminUserId);
  if (!administrator) return failure("FORBIDDEN", "Administrator access required.");
  const users = await prisma.user.findMany({
    where: {
      deactivatedAt: null,
      role: { in: [UserRole.ADMIN, UserRole.GOD] }
    },
    orderBy: [{ profile: { displayName: "asc" } }, { username: "asc" }],
    select: ticketUserSelect
  });
  return {
    ok: true as const,
    assignees: users.map((user) => ({
      id: user.id,
      name: userDisplayName(user),
      username: user.username
    }))
  };
}

export type AdminFeedbackTicketListView = Extract<
  Awaited<ReturnType<typeof listAdminFeedbackTickets>>,
  { ok: true }
>;
export type UserFeedbackTicketListView = Extract<
  Awaited<ReturnType<typeof listUserFeedbackTickets>>,
  { ok: true }
>;
export type FeedbackTicketDetailView = Extract<
  Awaited<ReturnType<typeof getFeedbackTicket>>,
  { ok: true }
>;
