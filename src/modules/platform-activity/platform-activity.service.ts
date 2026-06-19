import { createHash } from "crypto";
import { PlatformActivityEventType } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { recordPlatformActivitySchema, type PlatformActivitySummary } from "@/modules/platform-activity/types";

const MODULE_KEY = "platform-activity";

function hashSignal(value?: string | null) {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function trimRoute(route?: string) {
  if (!route) return null;
  const withoutOrigin = route.replace(/^https?:\/\/[^/]+/i, "");
  return withoutOrigin.split("?")[0]?.slice(0, 240) || "/";
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
      metadata: data.metadata ?? undefined,
      ipHash: hashSignal(input.ipAddress),
      userAgentHash: hashSignal(input.userAgent)
    }
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
