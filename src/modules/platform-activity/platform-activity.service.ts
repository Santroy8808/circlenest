import { createHash } from "crypto";
import { PlatformActivityEventType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { recordPlatformActivitySchema, type PlatformActivitySummary } from "@/modules/platform-activity/types";

const MODULE_KEY = "platform-activity";
const ACTIVITY_SCORE_HALF_LIFE_DAYS = 14;

function hashSignal(value?: string | null) {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function trimRoute(route?: string) {
  if (!route) return null;
  const withoutOrigin = route.replace(/^https?:\/\/[^/]+/i, "");
  return withoutOrigin.split("?")[0]?.slice(0, 240) || "/";
}

function metadataDeviceClass(metadata?: Record<string, string | number | boolean | null>, userAgent?: string | null) {
  if (metadata?.deviceClass === "MOBILE" || metadata?.deviceClass === "DESKTOP") return metadata.deviceClass;
  const lowerAgent = userAgent?.toLowerCase() ?? "";
  return /android|iphone|ipad|ipod|mobile/.test(lowerAgent) ? "MOBILE" : "DESKTOP";
}

function scoreForActivity(eventType: PlatformActivityEventType, metadata?: Record<string, string | number | boolean | null>) {
  if (eventType === PlatformActivityEventType.PAGE_VIEW) return 1;
  if (eventType === PlatformActivityEventType.HEARTBEAT) return metadata?.visible === false ? 0 : 0.5;
  if (
    eventType === PlatformActivityEventType.ACTION ||
    eventType === PlatformActivityEventType.SEARCH ||
    eventType === PlatformActivityEventType.AD_INTERACTION ||
    eventType === PlatformActivityEventType.NAVIGATION
  ) {
    return 0.5;
  }

  return 0;
}

function decayScore(score: number, lastSeenAt: Date | null, now: Date) {
  if (!lastSeenAt || score <= 0) return Math.max(score, 0);
  const elapsedDays = Math.max(0, now.getTime() - lastSeenAt.getTime()) / 86400000;
  return score * Math.pow(0.5, elapsedDays / ACTIVITY_SCORE_HALF_LIFE_DAYS);
}

async function updateUserApplicationUsageMetric(input: {
  userId?: string;
  eventType: PlatformActivityEventType;
  metadata?: Record<string, string | number | boolean | null>;
  userAgent?: string | null;
}) {
  if (!input.userId) return;

  const scoreIncrement = scoreForActivity(input.eventType, input.metadata);
  if (scoreIncrement <= 0) return;

  const now = new Date();
  const deviceClass = metadataDeviceClass(input.metadata, input.userAgent);
  const existing = await prisma.userApplicationUsageMetric.findUnique({
    where: { userId: input.userId }
  });
  const mobileScore = decayScore(existing?.mobileActivityScore ?? 0, existing?.lastSeenAt ?? null, now) + (deviceClass === "MOBILE" ? scoreIncrement : 0);
  const desktopScore = decayScore(existing?.desktopActivityScore ?? 0, existing?.lastSeenAt ?? null, now) + (deviceClass === "DESKTOP" ? scoreIncrement : 0);
  const mobileSeenAt = deviceClass === "MOBILE" ? now : existing?.lastMobileSeenAt ?? null;
  const desktopSeenAt = deviceClass === "DESKTOP" ? now : existing?.lastDesktopSeenAt ?? null;

  await prisma.userApplicationUsageMetric.upsert({
    where: { userId: input.userId },
    update: {
      mobileActivityScore: mobileScore,
      desktopActivityScore: desktopScore,
      lastSeenAt: now,
      lastMobileSeenAt: mobileSeenAt,
      lastDesktopSeenAt: desktopSeenAt
    },
    create: {
      userId: input.userId,
      mobileActivityScore: deviceClass === "MOBILE" ? scoreIncrement : 0,
      desktopActivityScore: deviceClass === "DESKTOP" ? scoreIncrement : 0,
      lastSeenAt: now,
      lastMobileSeenAt: deviceClass === "MOBILE" ? now : undefined,
      lastDesktopSeenAt: deviceClass === "DESKTOP" ? now : undefined
    }
  });
}

export async function recordPlatformActivity(input: {
  userId?: string;
  body: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const parsed = recordPlatformActivitySchema.safeParse(input.body);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid activity event." };
  }

  const data = parsed.data;
  const metadata = data.metadata as Prisma.InputJsonObject | undefined;

  await prisma.platformActivityEvent.create({
    data: {
      userId: input.userId,
      sessionKey: data.sessionKey || null,
      eventType: data.eventType,
      route: trimRoute(data.route ?? undefined),
      module: data.module || null,
      action: data.action || null,
      targetType: data.targetType || null,
      targetId: data.targetId || null,
      metadata,
      ipHash: hashSignal(input.ipAddress),
      userAgentHash: hashSignal(input.userAgent)
    }
  });
  await updateUserApplicationUsageMetric({
    userId: input.userId,
    eventType: data.eventType,
    metadata: data.metadata,
    userAgent: input.userAgent
  });

  return { ok: true as const };
}

export async function recordSessionStart(input: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await prisma.platformActivityEvent.create({
    data: {
      userId: input.userId,
      eventType: PlatformActivityEventType.SESSION_START,
      module: "auth-security",
      action: "login",
      ipHash: hashSignal(input.ipAddress),
      userAgentHash: hashSignal(input.userAgent)
    }
  });
}

export async function getPlatformActivitySummary(): Promise<PlatformActivitySummary> {
  const now = Date.now();
  const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  const [activeUsers, pageViews24h, actions24h, routeGroups] = await Promise.all([
    prisma.platformActivityEvent.findMany({
      where: {
        userId: { not: null },
        eventType: { in: [PlatformActivityEventType.PAGE_VIEW, PlatformActivityEventType.HEARTBEAT, PlatformActivityEventType.ACTION] },
        createdAt: { gte: fifteenMinutesAgo }
      },
      distinct: ["userId"],
      select: { userId: true }
    }),
    prisma.platformActivityEvent.count({
      where: {
        eventType: PlatformActivityEventType.PAGE_VIEW,
        createdAt: { gte: twentyFourHoursAgo }
      }
    }),
    prisma.platformActivityEvent.count({
      where: {
        eventType: { in: [PlatformActivityEventType.ACTION, PlatformActivityEventType.SEARCH, PlatformActivityEventType.AD_INTERACTION] },
        createdAt: { gte: twentyFourHoursAgo }
      }
    }),
    prisma.platformActivityEvent.groupBy({
      by: ["route"],
      where: {
        eventType: PlatformActivityEventType.PAGE_VIEW,
        route: { not: null },
        createdAt: { gte: twentyFourHoursAgo }
      },
      _count: { _all: true },
      orderBy: { _count: { route: "desc" } },
      take: 6
    })
  ]);

  await diagnostics.debug(MODULE_KEY, "Platform activity summary generated.", {
    activeUsers15m: activeUsers.length,
    pageViews24h
  });

  return {
    activeUsers15m: activeUsers.length,
    pageViews24h,
    actions24h,
    topRoutes24h: routeGroups.map((group) => ({
      route: group.route ?? "/",
      count: group._count._all
    }))
  };
}
