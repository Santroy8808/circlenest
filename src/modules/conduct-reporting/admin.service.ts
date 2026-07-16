import {
  ConductIncidentSource,
  ConductIncidentStatus,
  ConductReportType,
  ConductReviewStatus,
  type ConductLocationType,
  type Prisma
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { canModerateConductLocation } from "@/modules/conduct-reporting/permissions";
import { asJson, createConductFingerprint, createConductReference } from "@/modules/conduct-reporting/references";
import { applyPairwiseConductRestriction, CONDUCT_RESTRICTION_DAYS } from "@/modules/conduct-reporting/restrictions.service";
import { getConductConfig, listConductScanRuns } from "@/modules/conduct-reporting/scanner.service";

type ConductConfigPatch = {
  manualEnabled?: boolean;
  automaticEnabled?: boolean;
  scheduledEnabled?: boolean;
  scannerEnabled?: boolean;
  shadowMode?: boolean;
  createAutomatedReports?: boolean;
  sendAutomatedWarnings?: boolean;
  applyAutomatedRestrictions?: boolean;
  timezone?: string;
  scheduleLocalTime?: string;
  automaticIntervalMinutes?: number;
  maxItemsPerRun?: number;
  maxItemsPerDay?: number;
  maxBackfillDays?: number;
  contextBefore?: number;
  contextAfter?: number;
  primaryModel?: string;
  fallbackModel?: string;
  providerCallBudget?: number;
  tokenBudget?: number;
  estimatedCostBudgetUsd?: number;
  reviewThreshold?: number;
  restrictionDecayDays?: number;
  triggerDictionary?: Prisma.InputJsonValue | null;
  policyVersion?: string;
};

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function updateConductConfig(actorUserId: string, patch: ConductConfigPatch) {
  const current = await getConductConfig();
  const timezone = typeof patch.timezone === "string" && validTimezone(patch.timezone.trim()) ? patch.timezone.trim() : current.timezone;
  const scheduleLocalTime = typeof patch.scheduleLocalTime === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(patch.scheduleLocalTime)
    ? patch.scheduleLocalTime
    : current.scheduleLocalTime;
  const modelName = (value: unknown, fallback: string) =>
    typeof value === "string" && /^[a-z0-9._-]{2,100}$/i.test(value.trim()) ? value.trim() : fallback;
  const policyVersion = typeof patch.policyVersion === "string" && /^[a-z0-9._-]{2,80}$/i.test(patch.policyVersion.trim())
    ? patch.policyVersion.trim()
    : current.policyVersion;

  const data = {
    manualEnabled: patch.manualEnabled ?? current.manualEnabled,
    automaticEnabled: patch.automaticEnabled ?? current.automaticEnabled,
    scheduledEnabled: patch.scheduledEnabled ?? current.scheduledEnabled,
    scannerEnabled: patch.scannerEnabled ?? current.scannerEnabled,
    shadowMode: patch.shadowMode ?? current.shadowMode,
    createAutomatedReports: patch.createAutomatedReports ?? current.createAutomatedReports,
    sendAutomatedWarnings: patch.sendAutomatedWarnings ?? current.sendAutomatedWarnings,
    applyAutomatedRestrictions: patch.applyAutomatedRestrictions ?? current.applyAutomatedRestrictions,
    timezone,
    scheduleLocalTime,
    automaticIntervalMinutes: clampInteger(patch.automaticIntervalMinutes, 15, 10_080, current.automaticIntervalMinutes),
    maxItemsPerRun: clampInteger(patch.maxItemsPerRun, 10, 10_000, current.maxItemsPerRun),
    maxItemsPerDay: clampInteger(patch.maxItemsPerDay, 10, 50_000, current.maxItemsPerDay),
    maxBackfillDays: clampInteger(patch.maxBackfillDays, 1, 365, current.maxBackfillDays),
    contextBefore: clampInteger(patch.contextBefore, 0, 10, current.contextBefore),
    contextAfter: clampInteger(patch.contextAfter, 0, 10, current.contextAfter),
    primaryModel: modelName(patch.primaryModel, current.primaryModel),
    fallbackModel: modelName(patch.fallbackModel, current.fallbackModel),
    providerCallBudget: clampInteger(patch.providerCallBudget, 0, 10_000, current.providerCallBudget),
    tokenBudget: clampInteger(patch.tokenBudget, 0, 50_000_000, current.tokenBudget),
    estimatedCostBudgetUsd: clampNumber(patch.estimatedCostBudgetUsd, 0, 10_000, current.estimatedCostBudgetUsd),
    reviewThreshold: clampNumber(patch.reviewThreshold, 0, 1, current.reviewThreshold),
    restrictionDecayDays: clampInteger(patch.restrictionDecayDays, 1, 365, current.restrictionDecayDays),
    triggerDictionary: patch.triggerDictionary === null ? undefined : patch.triggerDictionary,
    policyVersion,
    updatedByUserId: actorUserId
  };
  const config = await prisma.conductConfig.update({ where: { id: "default" }, data });
  await prisma.auditLog.create({
    data: {
      actorUserId,
      module: "conduct-reporting",
      action: "configuration_updated",
      targetType: "ConductConfig",
      targetId: config.id,
      metadata: asJson({
        automaticEnabled: config.automaticEnabled,
        scheduledEnabled: config.scheduledEnabled,
        scannerEnabled: config.scannerEnabled,
        shadowMode: config.shadowMode,
        createAutomatedReports: config.createAutomatedReports,
        sendAutomatedWarnings: config.sendAutomatedWarnings,
        applyAutomatedRestrictions: config.applyAutomatedRestrictions
      })
    }
  });
  return config;
}

export async function getConductAdminView() {
  const [config, runs, candidates] = await Promise.all([
    getConductConfig(),
    listConductScanRuns(25),
    prisma.conductReviewCandidate.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { run: { select: { reference: true, mode: true, dryRun: true } }, incident: { select: { reference: true } } }
    })
  ]);
  return {
    config,
    runs: runs.map((run) => ({
      ...run,
      windowStart: run.windowStart.toISOString(),
      windowEnd: run.windowEnd.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString()
    })),
    candidates: candidates.map((candidate) => ({
      ...candidate,
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString()
    }))
  };
}

export async function assignConductCandidate(actorUserId: string, candidateReference: string, moderatorUserId: string | null) {
  const candidate = await prisma.conductReviewCandidate.findUnique({ where: { reference: candidateReference.trim().toUpperCase() } });
  if (!candidate || !(await canModerateConductLocation(actorUserId, candidate.locationType, candidate.groupId))) {
    return { ok: false as const, error: "That review candidate is not available." };
  }
  const updated = await prisma.conductReviewCandidate.update({
    where: { id: candidate.id },
    data: { assignedModeratorUserId: moderatorUserId, status: moderatorUserId ? ConductReviewStatus.ASSIGNED : ConductReviewStatus.PENDING }
  });
  return { ok: true as const, candidate: updated };
}

export async function dismissConductCandidate(actorUserId: string, candidateReference: string, reasonInput: unknown) {
  const reason = typeof reasonInput === "string" ? reasonInput.trim().slice(0, 2000) : "";
  const candidate = await prisma.conductReviewCandidate.findUnique({ where: { reference: candidateReference.trim().toUpperCase() } });
  if (!candidate || !(await canModerateConductLocation(actorUserId, candidate.locationType, candidate.groupId))) {
    return { ok: false as const, error: "That review candidate is not available." };
  }
  if (reason.length < 5) return { ok: false as const, error: "Enter a dismissal reason." };
  await prisma.$transaction(async (transaction) => {
    await transaction.conductReviewCandidate.update({
      where: { id: candidate.id },
      data: { status: ConductReviewStatus.DISMISSED, reviewReason: reason, assignedModeratorUserId: actorUserId }
    });
    await transaction.auditLog.create({
      data: { actorUserId, module: "conduct-reporting", action: "candidate_dismissed", targetType: "ConductReviewCandidate", targetId: candidate.id, metadata: asJson({ reference: candidate.reference, reason }) }
    });
  });
  return { ok: true as const };
}

export async function approveConductCandidate(actorUserId: string, candidateReference: string, reasonInput: unknown) {
  const reason = typeof reasonInput === "string" ? reasonInput.trim().slice(0, 2000) : "";
  const candidate = await prisma.conductReviewCandidate.findUnique({ where: { reference: candidateReference.trim().toUpperCase() } });
  if (!candidate || !(await canModerateConductLocation(actorUserId, candidate.locationType, candidate.groupId))) {
    return { ok: false as const, error: "That review candidate is not available." };
  }
  if (reason.length < 5) return { ok: false as const, error: "Enter an approval reason." };

  const result = await prisma.$transaction(async (transaction) => {
    const incidentFingerprint = createConductFingerprint([candidate.locationType, candidate.contentId]);
    let incident = await transaction.conductIncident.findUnique({ where: { fingerprint: incidentFingerprint } });
    if (!incident) {
      incident = await transaction.conductIncident.create({
        data: {
          reference: createConductReference("INC"),
          source: ConductIncidentSource.AUTOMATED_REVIEW,
          locationType: candidate.locationType,
          groupId: candidate.groupId,
          subjectContentId: candidate.contentId,
          subjectAuthorUserId: candidate.authorUserId,
          permalink: candidate.permalink,
          fingerprint: incidentFingerprint,
          evidenceSnapshot: candidate.contextSnapshot as Prisma.InputJsonValue,
          evidenceHashes: candidate.evidenceHashes as Prisma.InputJsonValue,
          evidenceContentIds: [candidate.contentId],
          policyCodes: candidate.policyCodes,
          status: ConductIncidentStatus.UNDER_REVIEW,
          createdByUserId: actorUserId,
          assignedModeratorUserId: actorUserId,
          modelMetadata: candidate.providerResult as Prisma.InputJsonValue | undefined
        }
      });
    }
    let report = await transaction.conductReport.findFirst({ where: { incidentId: incident.id, type: ConductReportType.AUTOMATED } });
    if (!report) {
      report = await transaction.conductReport.create({
        data: {
          reference: createConductReference("RPT"),
          incidentId: incident.id,
          reportedUserId: candidate.authorUserId,
          reporterUserId: null,
          type: ConductReportType.AUTOMATED,
          reasonCode: "human_review_approved",
          context: reason,
          policyCodes: candidate.policyCodes,
          evidenceContentIds: [candidate.contentId]
        }
      });
    }
    await transaction.conductReviewCandidate.update({
      where: { id: candidate.id },
      data: { status: ConductReviewStatus.APPROVED, reviewReason: reason, assignedModeratorUserId: actorUserId, incidentId: incident.id }
    });
    await transaction.conductEvent.create({
      data: { incidentId: incident.id, reportId: report.id, actorUserId, type: "REVIEW_CANDIDATE_APPROVED", metadata: asJson({ candidateReference: candidate.reference, reason }) }
    });
    await transaction.notification.create({
      data: {
        userId: candidate.authorUserId,
        title: "A conduct report concerns your account",
        body: `${report.reference} was approved by a human reviewer and is available for review or dispute.`,
        href: `/settings/reports?report=${encodeURIComponent(report.reference)}`
      }
    });
    return { incident, report };
  });
  return { ok: true as const, incidentReference: result.incident.reference, reportReference: result.report.reference };
}

export async function restrictConductCandidatePair(input: {
  actorUserId: string;
  candidateReference: string;
  otherUserId: string;
  requestedDays: number;
  reason: string;
}) {
  const candidate = await prisma.conductReviewCandidate.findUnique({ where: { reference: input.candidateReference.trim().toUpperCase() } });
  if (!candidate || !(await canModerateConductLocation(input.actorUserId, candidate.locationType, candidate.groupId))) {
    return { ok: false as const, error: "That review candidate is not available." };
  }
  if (!CONDUCT_RESTRICTION_DAYS.includes(input.requestedDays as (typeof CONDUCT_RESTRICTION_DAYS)[number])) {
    return { ok: false as const, error: "Choose a 3, 7, 14, or 30 day restriction." };
  }
  if (input.reason.trim().length < 10) return { ok: false as const, error: "Enter a specific restriction reason." };
  const restriction = await applyPairwiseConductRestriction({
    firstUserId: candidate.authorUserId,
    secondUserId: input.otherUserId,
    requestedDays: input.requestedDays as (typeof CONDUCT_RESTRICTION_DAYS)[number],
    reason: input.reason,
    createdByUserId: input.actorUserId
  });
  return { ok: true as const, restrictionReference: restriction.reference };
}

export type ConductCandidateFilter = {
  status?: ConductReviewStatus;
  locationType?: ConductLocationType;
  groupId?: string;
  authorUserId?: string;
  assignedModeratorUserId?: string;
};

export async function listConductCandidates(filter: ConductCandidateFilter = {}, take = 100) {
  return prisma.conductReviewCandidate.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.locationType ? { locationType: filter.locationType } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.authorUserId ? { authorUserId: filter.authorUserId } : {}),
      ...(filter.assignedModeratorUserId ? { assignedModeratorUserId: filter.assignedModeratorUserId } : {})
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(take, 1), 250)
  });
}
