import {
  AuditSeverity,
  ConductInvestigationStatus,
  ConductPostFlagStatus,
  type PlatformJob,
  Prisma
} from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import { getConductConfig } from "@/modules/conduct-reporting/scanner.service";
import { analyzeConductInvestigationWithProvider } from "@/modules/conduct-reporting/provider";
import { asJson, createConductReference } from "@/modules/conduct-reporting/references";
import { enqueuePlatformJob, type PlatformJobHandlerResult } from "@/modules/platform-jobs/platform-jobs.service";

const FLAG_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const FLAG_THRESHOLD = 3;
const MAX_WORKSPACE_POSTS = 150;
const MAX_REPORT_SOURCES = 500;
const MAX_PROVIDER_SOURCES = 100;

export function evaluateFlagTransition(input: {
  alreadyActive: boolean;
  activeBefore: number;
  activeAfter: number;
  now: Date;
}) {
  return {
    extendExistingFlags: !input.alreadyActive,
    expiresAt: new Date(input.now.getTime() + FLAG_LIFETIME_MS),
    queueInvestigation: !input.alreadyActive && input.activeBefore < FLAG_THRESHOLD && input.activeAfter >= FLAG_THRESHOLD
  };
}

const investigationFilterSchema = z.object({
  query: z.string().trim().max(200).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(MAX_WORKSPACE_POSTS).default(30)
});

type InvestigationSource = {
  postId: string;
  permalink: string;
  body: string;
  createdAt: string;
  visibility: string;
  tags: string[];
  flagged: boolean;
  flagReason: string | null;
  flaggedAt: string | null;
};

function parseSnapshot(value: Prisma.JsonValue): InvestigationSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.postId !== "string" || typeof record.permalink !== "string" || typeof record.body !== "string" || typeof record.createdAt !== "string") return [];
    return [{
      postId: record.postId,
      permalink: record.permalink,
      body: record.body,
      createdAt: record.createdAt,
      visibility: typeof record.visibility === "string" ? record.visibility : "UNKNOWN",
      tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string") : [],
      flagged: record.flagged === true,
      flagReason: typeof record.flagReason === "string" ? record.flagReason : null,
      flaggedAt: typeof record.flaggedAt === "string" ? record.flaggedAt : null
    }];
  });
}

async function requireAdmin(actorUserId: string) {
  if (!(await isAdminUser(actorUserId))) throw new Error("Admin access required.");
}

async function expireStaleFlags(writer: Prisma.TransactionClient | typeof prisma, now: Date) {
  return writer.conductPostFlag.updateMany({
    where: { status: ConductPostFlagStatus.ACTIVE, expiresAt: { lte: now } },
    data: { status: ConductPostFlagStatus.EXPIRED }
  });
}

async function collectInvestigationSources(
  writer: Prisma.TransactionClient | typeof prisma,
  subjectUserId: string,
  now: Date
) {
  const posts = await writer.feedPost.findMany({
    where: { authorUserId: subjectUserId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_REPORT_SOURCES,
    select: {
      id: true,
      body: true,
      visibility: true,
      createdAt: true,
      hashtags: { select: { hashtag: { select: { displayName: true } } } },
      conductFlags: {
        where: { status: ConductPostFlagStatus.ACTIVE, expiresAt: { gt: now } },
        take: 1,
        select: { reason: true, flaggedAt: true }
      }
    }
  });
  return posts
    .map((post): InvestigationSource => {
      const flag = post.conductFlags[0] ?? null;
      return {
        postId: post.id,
        permalink: `/posts/${post.id}`,
        body: post.body.slice(0, 5000),
        createdAt: post.createdAt.toISOString(),
        visibility: post.visibility,
        tags: post.hashtags.map((entry) => entry.hashtag.displayName),
        flagged: Boolean(flag),
        flagReason: flag?.reason ?? null,
        flaggedAt: flag?.flaggedAt.toISOString() ?? null
      };
    })
    .sort((left, right) => Number(right.flagged) - Number(left.flagged)
      || Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

async function createInvestigationRecord(input: {
  writer: Prisma.TransactionClient | typeof prisma;
  subjectUserId: string;
  requestedByUserId: string | null;
  triggerReason: string;
  now: Date;
}) {
  const sources = await collectInvestigationSources(input.writer, input.subjectUserId, input.now);
  const oldest = sources.reduce<Date | null>((current, source) => {
    const date = new Date(source.createdAt);
    return !current || date < current ? date : current;
  }, null);
  return input.writer.conductInvestigation.create({
    data: {
      reference: createConductReference("INV"),
      subjectUserId: input.subjectUserId,
      requestedByUserId: input.requestedByUserId,
      triggerReason: input.triggerReason,
      windowStart: oldest ?? input.now,
      windowEnd: input.now,
      sourcePostIds: sources.map((source) => source.postId),
      sourceSnapshot: asJson(sources)
    }
  });
}

async function enqueueInvestigation(investigationId: string) {
  return enqueuePlatformJob({
    kind: "conduct.investigation",
    payload: { investigationId },
    runAfter: new Date(0),
    maxAttempts: 3
  });
}

export async function flagFeedPostForInvestigation(actorUserId: string, input: unknown) {
  await requireAdmin(actorUserId);
  const parsed = z.object({
    postId: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(5).max(1000)
  }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid post flag." };

  const now = new Date();
  const initialTransition = evaluateFlagTransition({ alreadyActive: false, activeBefore: 0, activeAfter: 1, now });
  const expiresAt = initialTransition.expiresAt;
  const result = await prisma.$transaction(async (transaction) => {
    await expireStaleFlags(transaction, now);
    const post = await transaction.feedPost.findUnique({
      where: { id: parsed.data.postId },
      select: { id: true, authorUserId: true, body: true, createdAt: true, conductFlags: { take: 1 } }
    });
    if (!post) return { ok: false as const, error: "That post was not found." };

    const existing = post.conductFlags[0] ?? null;
    const alreadyActive = Boolean(existing && existing.status === ConductPostFlagStatus.ACTIVE && existing.expiresAt > now);
    const activeBefore = await transaction.conductPostFlag.count({
      where: { subjectUserId: post.authorUserId, status: ConductPostFlagStatus.ACTIVE, expiresAt: { gt: now } }
    });

    const beforeTransition = evaluateFlagTransition({ alreadyActive, activeBefore, activeAfter: activeBefore + (alreadyActive ? 0 : 1), now });
    if (beforeTransition.extendExistingFlags) {
      await transaction.conductPostFlag.updateMany({
        where: { subjectUserId: post.authorUserId, status: ConductPostFlagStatus.ACTIVE, expiresAt: { gt: now } },
        data: { expiresAt }
      });
    }

    const flag = await transaction.conductPostFlag.upsert({
      where: { postId: post.id },
      update: {
        subjectUserId: post.authorUserId,
        flaggedByUserId: actorUserId,
        status: ConductPostFlagStatus.ACTIVE,
        reason: parsed.data.reason,
        flaggedAt: alreadyActive ? existing!.flaggedAt : now,
        expiresAt: alreadyActive ? existing!.expiresAt : expiresAt,
        dismissedAt: null
      },
      create: {
        postId: post.id,
        subjectUserId: post.authorUserId,
        flaggedByUserId: actorUserId,
        reason: parsed.data.reason,
        flaggedAt: now,
        expiresAt
      }
    });

    const activeAfter = await transaction.conductPostFlag.findMany({
      where: { subjectUserId: post.authorUserId, status: ConductPostFlagStatus.ACTIVE, expiresAt: { gt: now } },
      orderBy: { flaggedAt: "desc" },
      select: { id: true, postId: true }
    });
    const crossedThreshold = evaluateFlagTransition({ alreadyActive, activeBefore, activeAfter: activeAfter.length, now }).queueInvestigation;
    let investigation = null;
    if (crossedThreshold) {
      investigation = await createInvestigationRecord({
        writer: transaction,
        subjectUserId: post.authorUserId,
        requestedByUserId: actorUserId,
        triggerReason: `${FLAG_THRESHOLD} active administrator post flags`,
        now
      });
      await transaction.conductPostFlag.updateMany({
        where: { id: { in: activeAfter.map((entry) => entry.id) } },
        data: { investigationId: investigation.id }
      });
    }

    await writeAuditLog({
      operationId: `admin-post-flag:${flag.id}:${now.getTime()}`,
      actorUserId,
      module: "conduct-investigation",
      action: alreadyActive ? "post_flag_refreshed" : "post_flag_created",
      targetType: "FeedPost",
      targetId: post.id,
      severity: AuditSeverity.warning,
      before: { activeFlagCount: activeBefore, alreadyActive },
      after: { activeFlagCount: activeAfter.length, expiresAt: flag.expiresAt.toISOString(), investigationReference: investigation?.reference ?? null },
      metadata: { subjectUserId: post.authorUserId, reason: parsed.data.reason }
    }, transaction);

    return {
      ok: true as const,
      flag,
      activeFlagCount: activeAfter.length,
      investigation: investigation ? { id: investigation.id, reference: investigation.reference } : null
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result.ok && result.investigation) await enqueueInvestigation(result.investigation.id);
  return result;
}

export async function startManualConductInvestigation(actorUserId: string, input: unknown) {
  await requireAdmin(actorUserId);
  const parsed = z.object({ subjectUserId: z.string().trim().min(1).max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Choose an account to investigate." };
  const subject = await prisma.user.findUnique({ where: { id: parsed.data.subjectUserId }, select: { id: true } });
  if (!subject) return { ok: false as const, error: "That account was not found." };

  const existing = await prisma.conductInvestigation.findFirst({
    where: { subjectUserId: subject.id, status: { in: [ConductInvestigationStatus.QUEUED, ConductInvestigationStatus.RUNNING] } },
    orderBy: { createdAt: "desc" }
  });
  if (existing) return { ok: true as const, investigation: existing, replayed: true as const };

  const now = new Date();
  await expireStaleFlags(prisma, now);
  const investigation = await createInvestigationRecord({
    writer: prisma,
    subjectUserId: subject.id,
    requestedByUserId: actorUserId,
    triggerReason: "Manual administrator investigation",
    now
  });
  await enqueueInvestigation(investigation.id);
  return { ok: true as const, investigation, replayed: false as const };
}

export async function getAdminInvestigationWorkspace(actorUserId: string, subjectUserId: string, filters: unknown = {}) {
  await requireAdmin(actorUserId);
  const parsed = investigationFilterSchema.safeParse(filters);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid investigation search.");
  const now = new Date();
  await expireStaleFlags(prisma, now);
  const subject = await prisma.user.findUnique({
    where: { id: subjectUserId },
    select: { id: true, username: true, email: true, profile: { select: { displayName: true, avatarUrl: true } } }
  });
  if (!subject) return null;

  const dateFilter = parsed.data.dateFrom || parsed.data.dateTo
    ? { createdAt: { ...(parsed.data.dateFrom ? { gte: parsed.data.dateFrom } : {}), ...(parsed.data.dateTo ? { lte: parsed.data.dateTo } : {}) } }
    : {};
  const query = parsed.data.query?.trim();
  const tags = parsed.data.tags?.map((tag) => tag.replace(/^#/, "").toLowerCase()) ?? [];
  const postWhere: Prisma.FeedPostWhereInput = {
    authorUserId: subject.id,
    ...dateFilter,
    ...(query ? {
        OR: [
          { body: { contains: query, mode: "insensitive" } },
          { hashtags: { some: { hashtag: { OR: [
            { normalized: { contains: query.replace(/^#/, "").toLowerCase() } },
            { displayName: { contains: query, mode: "insensitive" } }
          ] } } } }
        ]
      } : {}),
    ...(tags.length ? { hashtags: { some: { hashtag: { normalized: { in: tags } } } } } : {})
  };
  const [posts, totalPostCount] = await Promise.all([prisma.feedPost.findMany({
    where: postWhere,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (parsed.data.page - 1) * parsed.data.pageSize,
    take: parsed.data.pageSize,
    select: {
      id: true,
      body: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
      mediaAsset: { select: { publicUrl: true, mimeType: true } },
      hashtags: { select: { hashtag: { select: { displayName: true } } } },
      conductFlags: {
        where: { status: ConductPostFlagStatus.ACTIVE, expiresAt: { gt: now } },
        take: 1,
        select: { id: true, reason: true, flaggedAt: true, expiresAt: true }
      }
    }
  }), prisma.feedPost.count({ where: postWhere })]);
  const [activeFlagCount, investigations] = await Promise.all([
    prisma.conductPostFlag.count({ where: { subjectUserId: subject.id, status: ConductPostFlagStatus.ACTIVE, expiresAt: { gt: now } } }),
    prisma.conductInvestigation.findMany({
      where: { subjectUserId: subject.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, reference: true, status: true, triggerReason: true, summary: true, report: true, sourcePostIds: true, createdAt: true, completedAt: true, error: true }
    })
  ]);

  return {
    subject: { ...subject, displayName: subject.profile?.displayName ?? subject.username },
    activeFlagCount,
    pagination: {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total: totalPostCount,
      pageCount: Math.max(1, Math.ceil(totalPostCount / parsed.data.pageSize))
    },
    posts: posts.map((post) => ({
      ...post,
      permalink: `/posts/${post.id}`,
      tags: post.hashtags.map((entry) => entry.hashtag.displayName),
      activeFlag: post.conductFlags[0] ?? null
    })),
    investigations
  };
}

export async function runConductInvestigationPlatformJob(job: PlatformJob): Promise<PlatformJobHandlerResult> {
  const payload = job.payload && typeof job.payload === "object" && !Array.isArray(job.payload) ? job.payload as Record<string, unknown> : {};
  const investigationId = typeof payload.investigationId === "string" ? payload.investigationId : "";
  if (!investigationId) return { ok: false, error: "Investigation job is missing investigationId." };
  const claimed = await prisma.conductInvestigation.updateMany({
    where: { id: investigationId, status: ConductInvestigationStatus.QUEUED },
    data: { status: ConductInvestigationStatus.RUNNING, startedAt: new Date(), error: null }
  });
  if (claimed.count !== 1) {
    const existing = await prisma.conductInvestigation.findUnique({ where: { id: investigationId }, select: { status: true } });
    return existing?.status === ConductInvestigationStatus.COMPLETED || existing?.status === ConductInvestigationStatus.NEEDS_REVIEW
      ? { ok: true, result: asJson({ replayed: true, status: existing.status }) }
      : { ok: false, error: "Investigation is not queued." };
  }

  try {
    const investigation = await prisma.conductInvestigation.findUnique({ where: { id: investigationId } });
    if (!investigation) throw new Error("Investigation was not found.");
    const sources = parseSnapshot(investigation.sourceSnapshot);
    const providerSources = [...sources]
      .sort((left, right) => Number(right.flagged) - Number(left.flagged) || Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, MAX_PROVIDER_SOURCES);
    const config = await getConductConfig();
    let provider = await analyzeConductInvestigationWithProvider({
      model: config.primaryModel,
      policyVersion: config.policyVersion,
      subjectUserId: investigation.subjectUserId,
      sources: providerSources.map(({ postId, permalink, body, createdAt, tags, flagged }) => ({ postId, permalink, body, createdAt, tags, flagged }))
    });
    if (provider.error && process.env.CONDUCT_AI_API_KEY && config.fallbackModel !== config.primaryModel) {
      provider = await analyzeConductInvestigationWithProvider({
        model: config.fallbackModel,
        policyVersion: config.policyVersion,
        subjectUserId: investigation.subjectUserId,
        sources: providerSources.map(({ postId, permalink, body, createdAt, tags, flagged }) => ({ postId, permalink, body, createdAt, tags, flagged }))
      });
    }
    const completedAt = new Date();
    const updated = await prisma.conductInvestigation.update({
      where: { id: investigation.id },
      data: provider.analysis ? {
        status: ConductInvestigationStatus.COMPLETED,
        report: asJson(provider.analysis),
        summary: provider.analysis.overallAssessment,
        providerModel: provider.model,
        providerTokenCount: provider.tokenCount,
        error: null,
        completedAt
      } : {
        status: ConductInvestigationStatus.NEEDS_REVIEW,
        summary: "The source package is ready for independent human review, but automated analysis did not complete.",
        providerModel: provider.model,
        providerTokenCount: provider.tokenCount,
        error: provider.error,
        completedAt
      }
    });
    return { ok: true, result: asJson({ investigationId: updated.id, reference: updated.reference, status: updated.status }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Investigation failed.";
    await prisma.conductInvestigation.updateMany({
      where: { id: investigationId, status: ConductInvestigationStatus.RUNNING },
      data: { status: ConductInvestigationStatus.FAILED, error: message, completedAt: new Date() }
    });
    return { ok: false, error: message };
  }
}
