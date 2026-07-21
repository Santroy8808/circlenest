import {
  ConductLocationType,
  ConductScanMode,
  ConductScanStatus,
  type ConductConfig,
  type PlatformJob,
  type Prisma
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { detectConductCandidate } from "@/modules/conduct-reporting/classifier";
import { analyzeConductCandidateWithProvider } from "@/modules/conduct-reporting/provider";
import { asJson, createConductFingerprint, createConductReference, hashConductEvidence } from "@/modules/conduct-reporting/references";
import { assertConductScannerModelBoundary, CONDUCT_SCANNER_SOURCE_MODELS } from "@/modules/conduct-reporting/source-resolver";
import { enqueuePlatformJob, type PlatformJobHandlerResult } from "@/modules/platform-jobs/platform-jobs.service";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";
import { publicStreamVisibilityFilter } from "@/modules/feed-stream/feed-visibility";

type EligibleItem = {
  locationType: ConductLocationType;
  contentId: string;
  authorUserId: string;
  groupId: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  permalink: string;
  contextRootId: string;
};

type ScanRequest = {
  mode: ConductScanMode;
  requestedByUserId?: string | null;
  windowStart: Date;
  windowEnd: Date;
  groupId?: string | null;
  dryRun?: boolean;
};

const LEASE_MS = 20 * 60 * 1000;

export async function getConductConfig() {
  return prisma.conductConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

export async function queueConductScan(input: ScanRequest) {
  if (!(await isFeatureEnabled("operations.communication_review"))) {
    throw new Error("Communication Review Scanner is disabled in Feature Controls.");
  }
  if (input.windowEnd <= input.windowStart) throw new Error("Review end time must follow its start time.");
  const config = await getConductConfig();
  const backfillDays = (input.windowEnd.getTime() - input.windowStart.getTime()) / 86_400_000;
  if (backfillDays > config.maxBackfillDays) throw new Error(`Review window cannot exceed ${config.maxBackfillDays} days.`);
  const run = await prisma.conductScanRun.create({
    data: {
      reference: createConductReference("RUN"),
      mode: input.mode,
      dryRun: Boolean(input.dryRun),
      requestedByUserId: input.requestedByUserId ?? null,
      groupId: input.groupId ?? null,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd
    }
  });
  await enqueuePlatformJob({ kind: "conduct.scan", payload: { runId: run.id } });
  return run;
}

async function acquireLease(token: string) {
  const now = new Date();
  await prisma.conductScanState.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  const claimed = await prisma.conductScanState.updateMany({
    where: { id: "default", OR: [{ leaseToken: null }, { leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] },
    data: { leaseToken: token, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) }
  });
  return claimed.count === 1;
}

async function releaseLease(token: string) {
  await prisma.conductScanState.updateMany({
    where: { id: "default", leaseToken: token },
    data: { leaseToken: null, leaseExpiresAt: null }
  });
}

async function listEligibleItems(run: { windowStart: Date; windowEnd: Date; groupId: string | null }, limit: number) {
  assertConductScannerModelBoundary(CONDUCT_SCANNER_SOURCE_MODELS);
  const range = { gte: run.windowStart, lte: run.windowEnd };
  const [feedPosts, feedComments, groupThreads, groupPosts, groupAssetComments, disputeMessages] = await Promise.all([
    prisma.feedPost.findMany({
      where: {
        updatedAt: range,
        visibility: publicStreamVisibilityFilter(),
        streamArchivedAt: null,
        streamDeletedAt: null,
        adminHoldAt: null,
        ...(run.groupId ? { id: "__NO_GROUP_FEED_MATCH__" } : {})
      },
      select: { id: true, authorUserId: true, body: true, createdAt: true, updatedAt: true },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit
    }),
    prisma.feedComment.findMany({
      where: {
        updatedAt: range,
        deletedAt: null,
        post: {
          visibility: publicStreamVisibilityFilter(),
          streamArchivedAt: null,
          streamDeletedAt: null,
          adminHoldAt: null
        },
        ...(run.groupId ? { id: "__NO_GROUP_FEED_MATCH__" } : {})
      },
      select: { id: true, postId: true, authorUserId: true, body: true, createdAt: true, updatedAt: true },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit
    }),
    prisma.groupForumThread.findMany({
      where: { updatedAt: range, deletedAt: null, group: { archivedAt: null }, ...(run.groupId ? { groupId: run.groupId } : {}) },
      select: { id: true, groupId: true, authorUserId: true, title: true, body: true, createdAt: true, updatedAt: true, group: { select: { slug: true } } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit
    }),
    prisma.groupForumPost.findMany({
      where: { updatedAt: range, deletedAt: null, thread: { deletedAt: null, group: { archivedAt: null }, ...(run.groupId ? { groupId: run.groupId } : {}) } },
      select: { id: true, threadId: true, authorUserId: true, body: true, createdAt: true, updatedAt: true, thread: { select: { groupId: true, group: { select: { slug: true } } } } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit
    }),
    prisma.groupAssetComment.findMany({
      where: { createdAt: range, deletedAt: null, asset: { deletedAt: null, group: { archivedAt: null }, ...(run.groupId ? { groupId: run.groupId } : {}) } },
      select: { id: true, authorUserId: true, body: true, createdAt: true, asset: { select: { id: true, groupId: true, updatedAt: true, group: { select: { slug: true } } } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit
    }),
    prisma.conductDisputeMessage.findMany({
      where: { createdAt: range, dispute: { status: "OPEN", ...(run.groupId ? { incident: { groupId: run.groupId } } : {}) } },
      select: { id: true, authorUserId: true, body: true, createdAt: true, dispute: { select: { id: true, reference: true, incident: { select: { groupId: true } } } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit
    })
  ]);

  const items: EligibleItem[] = [
    ...feedPosts.map((item) => ({ ...item, contentId: item.id, locationType: ConductLocationType.MAIN_STREAM_POST, groupId: null, permalink: `/posts/${item.id}`, contextRootId: item.id })),
    ...feedComments.map((item) => ({ ...item, contentId: item.id, locationType: ConductLocationType.MAIN_STREAM_COMMENT, groupId: null, permalink: `/posts/${item.postId}?commentId=${item.id}`, contextRootId: item.postId })),
    ...groupThreads.map((item) => ({ ...item, contentId: item.id, body: `${item.title}\n\n${item.body}`, locationType: ConductLocationType.GROUP_FORUM_THREAD, permalink: `/groups/${item.group.slug}/forum/${item.id}`, contextRootId: item.id })),
    ...groupPosts.map((item) => ({ ...item, contentId: item.id, groupId: item.thread.groupId, locationType: ConductLocationType.GROUP_FORUM_POST, permalink: `/groups/${item.thread.group.slug}/forum/${item.threadId}?postId=${item.id}`, contextRootId: item.threadId })),
    ...groupAssetComments.map((item) => ({ ...item, contentId: item.id, updatedAt: item.asset.updatedAt, groupId: item.asset.groupId, locationType: ConductLocationType.GROUP_ASSET_COMMENT, permalink: `/groups/${item.asset.group.slug}/gallery/${item.asset.id}?commentId=${item.id}`, contextRootId: item.asset.id })),
    ...disputeMessages.map((item) => ({ ...item, contentId: item.id, updatedAt: item.createdAt, groupId: item.dispute.incident.groupId, locationType: ConductLocationType.DISPUTE_STATEMENT, permalink: `/settings/reports/disputes/${item.dispute.reference}`, contextRootId: item.dispute.id }))
  ];
  return items.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.contentId.localeCompare(b.contentId)).slice(0, limit);
}

async function loadBoundedContext(item: EligibleItem, config: ConductConfig) {
  const take = Math.max(1, Math.min(20, config.contextBefore + config.contextAfter + 1));
  if (item.locationType === ConductLocationType.MAIN_STREAM_POST || item.locationType === ConductLocationType.MAIN_STREAM_COMMENT) {
    const post = await prisma.feedPost.findUnique({
      where: { id: item.contextRootId },
      select: { id: true, authorUserId: true, body: true, createdAt: true, comments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, take, select: { id: true, authorUserId: true, body: true, createdAt: true } } }
    });
    return post ? [{ contentId: post.id, authorUserId: post.authorUserId, body: post.body, createdAt: post.createdAt.toISOString() }, ...post.comments.map((comment) => ({ contentId: comment.id, authorUserId: comment.authorUserId, body: comment.body, createdAt: comment.createdAt.toISOString() }))] : [];
  }
  if (item.locationType === ConductLocationType.GROUP_FORUM_THREAD || item.locationType === ConductLocationType.GROUP_FORUM_POST) {
    const thread = await prisma.groupForumThread.findUnique({
      where: { id: item.contextRootId },
      select: { id: true, authorUserId: true, title: true, body: true, createdAt: true, posts: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, take, select: { id: true, authorUserId: true, body: true, createdAt: true } } }
    });
    return thread ? [{ contentId: thread.id, authorUserId: thread.authorUserId, body: `${thread.title}\n\n${thread.body}`, createdAt: thread.createdAt.toISOString() }, ...thread.posts.map((post) => ({ contentId: post.id, authorUserId: post.authorUserId, body: post.body, createdAt: post.createdAt.toISOString() }))] : [];
  }
  if (item.locationType === ConductLocationType.GROUP_ASSET_COMMENT) {
    const comments = await prisma.groupAssetComment.findMany({ where: { groupAssetId: item.contextRootId, deletedAt: null }, orderBy: { createdAt: "asc" }, take, select: { id: true, authorUserId: true, body: true, createdAt: true } });
    return comments.map((comment) => ({ contentId: comment.id, authorUserId: comment.authorUserId, body: comment.body, createdAt: comment.createdAt.toISOString() }));
  }
  const messages = await prisma.conductDisputeMessage.findMany({ where: { disputeId: item.contextRootId }, orderBy: { createdAt: "asc" }, take, select: { id: true, authorUserId: true, body: true, createdAt: true } });
  return messages.map((message) => ({ contentId: message.id, authorUserId: message.authorUserId, body: message.body, createdAt: message.createdAt.toISOString() }));
}

async function executeConductScan(runId: string) {
  const run = await prisma.conductScanRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== ConductScanStatus.QUEUED) return { ok: false as const, error: "Conduct scan run is not queued." };
  const leaseToken = `${run.id}:${Date.now()}`;
  if (!(await acquireLease(leaseToken))) return { ok: false as const, error: "Another conduct scan is already running." };

  let processedCount = 0;
  let candidateCount = 0;
  let deduplicatedCount = 0;
  let providerCallCount = 0;
  let providerTokenCount = 0;
  let estimatedCostUsd = 0;
  try {
    const config = await getConductConfig();
    if (!(await isFeatureEnabled("operations.communication_review"))) {
      throw new Error("Communication Review Scanner is disabled in Feature Controls.");
    }
    if (!config.scannerEnabled) throw new Error("Communication review scanner is disabled.");
    await prisma.conductScanRun.update({ where: { id: run.id }, data: { status: ConductScanStatus.RUNNING, startedAt: new Date() } });
    const items = await listEligibleItems(run, config.maxItemsPerRun);
    for (const item of items) {
      processedCount += 1;
      const local = detectConductCandidate(item.body, config.triggerDictionary);
      if (!local.candidate) continue;
      candidateCount += 1;
      const context = await loadBoundedContext(item, config);
      const evidenceHash = hashConductEvidence({ item, context });
      const fingerprint = createConductFingerprint([config.policyVersion, item.locationType, item.contentId, evidenceHash]);
      if (await prisma.conductReviewCandidate.findUnique({ where: { fingerprint }, select: { id: true } })) {
        deduplicatedCount += 1;
        continue;
      }

      let providerResult = await analyzeConductCandidateWithProvider({
        model: config.primaryModel,
        policyVersion: config.policyVersion,
        subject: { contentId: item.contentId, authorUserId: item.authorUserId, body: item.body },
        context,
        localSignals: local
      });
      if (providerResult.error && process.env.CONDUCT_AI_API_KEY && config.fallbackModel !== config.primaryModel) {
        providerResult = await analyzeConductCandidateWithProvider({
          model: config.fallbackModel,
          policyVersion: config.policyVersion,
          subject: { contentId: item.contentId, authorUserId: item.authorUserId, body: item.body },
          context,
          localSignals: local
        });
      }
      if (process.env.CONDUCT_AI_API_KEY) providerCallCount += 1;
      providerTokenCount += providerResult.tokenCount;
      estimatedCostUsd += providerResult.estimatedCostUsd;
      if (providerCallCount > config.providerCallBudget || providerTokenCount > config.tokenBudget || estimatedCostUsd > config.estimatedCostBudgetUsd) break;

      if (!run.dryRun) {
        await prisma.conductReviewCandidate.create({
          data: {
            reference: createConductReference("REV"),
            runId: run.id,
            fingerprint,
            locationType: item.locationType,
            groupId: item.groupId,
            contentId: item.contentId,
            authorUserId: item.authorUserId,
            permalink: item.permalink,
            contextSnapshot: asJson(context),
            evidenceHashes: asJson([evidenceHash]),
            localSignals: asJson(local),
            providerResult: providerResult.analysis ? asJson({ ...providerResult.analysis, model: providerResult.model }) : undefined,
            score: providerResult.analysis?.confidence ?? null,
            policyCodes: providerResult.analysis?.policyCodes ?? local.policyCodes
          }
        });
      }
    }
    const completedAt = new Date();
    const status = processedCount >= config.maxItemsPerRun ? ConductScanStatus.PARTIAL : ConductScanStatus.COMPLETED;
    const cursorItem = items.at(-1);
    await prisma.$transaction(async (transaction) => {
      await transaction.conductScanRun.update({
        where: { id: run.id },
        data: {
          status,
          processedCount,
          candidateCount,
          deduplicatedCount,
          providerCallCount,
          providerTokenCount,
          estimatedCostUsd,
          cursorEnd: cursorItem ? asJson({ updatedAt: cursorItem.updatedAt.toISOString(), contentId: cursorItem.contentId }) : undefined,
          completedAt
        }
      });
      if (cursorItem && run.mode !== ConductScanMode.BACKFILL && !run.dryRun) {
        await transaction.conductScanState.update({ where: { id: "default" }, data: { cursorCreatedAt: cursorItem.updatedAt, cursorContentId: cursorItem.contentId } });
      }
    });
    return { ok: true as const, processedCount, candidateCount, deduplicatedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Communication review failed.";
    await prisma.conductScanRun.updateMany({
      where: { id: run.id, status: { in: [ConductScanStatus.QUEUED, ConductScanStatus.RUNNING] } },
      data: { status: ConductScanStatus.FAILED, error: message, processedCount, candidateCount, deduplicatedCount, providerCallCount, providerTokenCount, estimatedCostUsd, completedAt: new Date() }
    });
    return { ok: false as const, error: message };
  } finally {
    await releaseLease(leaseToken);
  }
}

export async function runConductScanPlatformJob(job: PlatformJob): Promise<PlatformJobHandlerResult> {
  const payload = job.payload && typeof job.payload === "object" && !Array.isArray(job.payload) ? (job.payload as Record<string, unknown>) : {};
  const runId = typeof payload.runId === "string" ? payload.runId : "";
  if (!runId) return { ok: false, error: "Conduct scan job is missing runId." };
  const result = await executeConductScan(runId);
  return result.ok ? { ok: true, result: asJson(result) } : { ok: false, error: result.error };
}

function zonedDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { dateKey: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` };
}

export async function enqueueDueConductScans(now = new Date()) {
  if (!(await isFeatureEnabled("operations.communication_review"))) return [];
  const config = await getConductConfig();
  const state = await prisma.conductScanState.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  const queued: string[] = [];
  if (config.scheduledEnabled && config.scannerEnabled) {
    const current = zonedDateKey(now, config.timezone);
    const last = state.lastScheduledAt ? zonedDateKey(state.lastScheduledAt, config.timezone).dateKey : null;
    if (current.time >= config.scheduleLocalTime && last !== current.dateKey) {
      const windowEnd = now;
      const windowStart = state.cursorCreatedAt ?? new Date(now.getTime() - 86_400_000);
      const run = await queueConductScan({ mode: ConductScanMode.SCHEDULED, windowStart, windowEnd });
      await prisma.conductScanState.update({ where: { id: "default" }, data: { lastScheduledAt: now } });
      queued.push(run.reference);
    }
  }
  if (config.automaticEnabled && config.scannerEnabled) {
    const dueAt = new Date((state.lastAutomaticAt?.getTime() ?? 0) + config.automaticIntervalMinutes * 60_000);
    if (dueAt <= now) {
      const run = await queueConductScan({ mode: ConductScanMode.AUTOMATIC, windowStart: state.cursorCreatedAt ?? new Date(now.getTime() - 86_400_000), windowEnd: now });
      await prisma.conductScanState.update({ where: { id: "default" }, data: { lastAutomaticAt: now } });
      queued.push(run.reference);
    }
  }
  return queued;
}

export async function listConductScanRuns(limit = 25) {
  return prisma.conductScanRun.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 100) });
}
