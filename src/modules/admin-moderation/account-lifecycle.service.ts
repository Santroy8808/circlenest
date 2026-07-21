import {
  AuditSeverity,
  AuthSecurityEventType,
  DestructiveActionKind,
  DestructiveActionStatus,
  Prisma
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { findAuditLogByOperationId, writeAuditLog } from "@/lib/platform/audit";
import { lockAccountDeletionFenceUsers } from "@/lib/platform/account-deletion-fence";
import { prisma } from "@/lib/platform/db";
import {
  protectedRetentionTables,
  requireDeletePasswordValue
} from "@/lib/platform/delete-protection";
import { evaluateAdminActorTarget, isAdminRole } from "@/lib/platform/roles";
import {
  ACCOUNT_CLEANUP_CONDITIONAL_RETENTION_RULES,
  ACCOUNT_CLEANUP_ORDINARY_MODELS,
  ACCOUNT_CLEANUP_PRESERVED_MODELS,
  ACCOUNT_DATA_CLEANUP_JOB_KIND,
  persistAccountDeletionStorageManifest,
  snapshotAdCampaignTargetsForAccountDeletion
} from "@/modules/admin-moderation/account-cleanup.service";

const MODULE_KEY = "admin-account-lifecycle";

const commandIdSchema = z.string().trim().min(8).max(160);

export const lifecycleSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suspend"),
    commandId: commandIdSchema,
    userIdentifier: z.string().trim().min(1).max(160),
    reason: z.string().trim().min(5).max(500)
  }),
  z.object({
    action: z.literal("restore"),
    commandId: commandIdSchema,
    userIdentifier: z.string().trim().min(1).max(160),
    reason: z.string().trim().min(5).max(500)
  }),
  z.object({
    action: z.literal("request-delete"),
    commandId: commandIdSchema,
    userIdentifier: z.string().trim().min(1).max(160),
    reason: z.string().trim().min(5).max(500)
  }),
  z.object({
    action: z.literal("confirm-delete"),
    commandId: commandIdSchema,
    destructiveActionRequestId: z.string().trim().min(1).max(180),
    confirmation: z.string().trim().min(1).max(180),
    deletePassword: z.string().min(1).max(120)
  })
]);

const deleteRequestMetadataSchema = z.object({
  version: z.literal(1),
  targetUserId: z.string().min(1),
  reason: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  expectedConfirmationDigest: z.string().regex(/^[a-f0-9]{64}$/),
  mediaAssetCountAtRequest: z.number().int().nonnegative(),
  retainedProtectedTables: z.array(z.object({ table: z.string().min(1), tags: z.array(z.string().min(1)) })),
  preservedModels: z.array(z.string().min(1)),
  ordinaryModels: z.array(z.string().min(1)),
  conditionalRetentionRules: z.array(z.object({ models: z.array(z.string().min(1)), rule: z.string().min(1) }))
});

type DeleteRequestMetadata = z.infer<typeof deleteRequestMetadataSchema>;

const DELETE_REQUEST_TTL_MS = 10 * 60 * 1000;
const ACTIVE_DELETE_STATUSES = [
  DestructiveActionStatus.PENDING_CONFIRMATION,
  DestructiveActionStatus.CONFIRMED,
  DestructiveActionStatus.QUEUED,
  DestructiveActionStatus.RUNNING
] as const;

function normalizeIdentifier(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function retentionSafeDeletedUsername(userId: string) {
  return `deleted-${userId.toLowerCase()}`.slice(0, 80);
}

function confirmationDigest(requestId: string, confirmation: string) {
  return createHash("sha256").update(`${requestId}\u0000${confirmation}`, "utf8").digest("hex");
}

async function findTarget(identifier: string) {
  const normalized = normalizeIdentifier(identifier);

  return prisma.user.findFirst({
    where: { OR: [{ email: normalized }, { username: normalized }] },
    select: {
      id: true,
      username: true,
      role: true,
      deactivatedAt: true,
      _count: { select: { mediaAssets: true } }
    }
  });
}

async function findTargetById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      deactivatedAt: true
    }
  });
}

async function getActor(actorUserId: string) {
  return prisma.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, role: true, deactivatedAt: true }
  });
}

function canActOnTarget(
  actor: Awaited<ReturnType<typeof getActor>>,
  target: { id: string; role: "MEMBER" | "ADMIN" | "GOD" }
) {
  return Boolean(
    actor &&
      !actor.deactivatedAt &&
      evaluateAdminActorTarget({
        actorUserId: actor.id,
        actorRole: actor.role,
        targetUserId: target.id,
        targetRole: target.role
      }).allowed
  );
}

export function parseDeleteRequestMetadata(value: Prisma.JsonValue | null): DeleteRequestMetadata | null {
  const parsed = deleteRequestMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function recordDeleteConfirmationDenied(input: {
  actorUserId: string;
  targetUserId: string;
  destructiveActionRequestId: string;
  reason: "expired" | "confirmation_mismatch" | "delete_password_rejected";
}) {
  await prisma.authSecurityEvent.create({
    data: {
      userId: input.actorUserId,
      type: AuthSecurityEventType.DESTRUCTIVE_ACTION_DENIED,
      identifier: input.targetUserId,
      metadata: {
        destructiveActionRequestId: input.destructiveActionRequestId,
        reason: input.reason
      }
    }
  });
}

export async function changeAccountLifecycle(actorUserId: string, input: unknown) {
  const parsed = lifecycleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid account action." };
  }
  const actor = await getActor(actorUserId);
  if (!actor || actor.deactivatedAt || !isAdminRole(actor.role)) {
    return { ok: false as const, error: "Admin access required." };
  }

  const priorAudit = await findAuditLogByOperationId(parsed.data.commandId);
  if (priorAudit) {
    const expectedAction = parsed.data.action === "suspend"
      ? "account.suspended"
      : parsed.data.action === "restore"
        ? "account.restored"
        : parsed.data.action === "request-delete"
          ? "account.delete_requested"
          : "account.delete_queued";
    if (priorAudit.actorUserId !== actorUserId || priorAudit.action !== expectedAction) {
      return { ok: false as const, error: "That administrator command id has already been used." };
    }
    const metadata = priorAudit.metadata && typeof priorAudit.metadata === "object" && !Array.isArray(priorAudit.metadata)
      ? (priorAudit.metadata as Record<string, unknown>)
      : {};
    const after = priorAudit.after && typeof priorAudit.after === "object" && !Array.isArray(priorAudit.after)
      ? (priorAudit.after as Record<string, unknown>)
      : {};
    if (parsed.data.action === "confirm-delete") {
      if (metadata.destructiveActionRequestId !== parsed.data.destructiveActionRequestId) {
        return { ok: false as const, error: "That administrator command id has already been used." };
      }
    } else {
      const replayTarget = await findTarget(parsed.data.userIdentifier);
      if (!replayTarget || replayTarget.id !== priorAudit.targetId) {
        return { ok: false as const, error: "That administrator command id has already been used." };
      }
      if (parsed.data.action === "request-delete" && typeof metadata.destructiveActionRequestId === "string") {
        const request = await prisma.destructiveActionRequest.findUnique({
          where: { id: metadata.destructiveActionRequestId },
          select: { id: true, status: true }
        });
        if (request?.status === DestructiveActionStatus.PENDING_CONFIRMATION) {
          metadata.expectedConfirmation = `DELETE ${replayTarget.username}`;
        }
      }
    }
    return {
      ok: true as const,
      action: priorAudit.action,
      destructiveActionRequestId: typeof metadata.destructiveActionRequestId === "string" ? metadata.destructiveActionRequestId : undefined,
      expectedConfirmation: typeof metadata.expectedConfirmation === "string" ? metadata.expectedConfirmation : undefined,
      expiresAt: typeof metadata.expiresAt === "string" ? metadata.expiresAt : undefined,
      cleanup: after.cleanup ?? (
        typeof after.cleanupStatus === "string"
          ? { status: after.cleanupStatus, platformJobId: after.platformJobId }
          : undefined
      ),
      replayed: true as const
    };
  }

  if (parsed.data.action === "confirm-delete") {
    const request = await prisma.destructiveActionRequest.findUnique({
      where: { id: parsed.data.destructiveActionRequestId }
    });
    const requestMetadata = request ? parseDeleteRequestMetadata(request.result) : null;
    if (
      !request ||
      request.kind !== DestructiveActionKind.DELETE_ACCOUNT ||
      request.targetType !== "User" ||
      !requestMetadata
    ) {
      return { ok: false as const, error: "The destructive-action request was not found." };
    }
    if (request.requestedByUserId !== actorUserId) {
      return { ok: false as const, error: "The administrator who requested deletion must confirm it." };
    }
    if (request.status !== DestructiveActionStatus.PENDING_CONFIRMATION) {
      return { ok: false as const, error: "That destructive-action request is no longer pending." };
    }
    if (new Date(requestMetadata.expiresAt).getTime() <= Date.now()) {
      await prisma.$transaction(async (tx) => {
        await tx.destructiveActionRequest.updateMany({
          where: { id: request.id, status: DestructiveActionStatus.PENDING_CONFIRMATION },
          data: { status: DestructiveActionStatus.CANCELLED, error: "Confirmation window expired." }
        });
        await tx.authSecurityEvent.create({
          data: {
            userId: actorUserId,
            type: AuthSecurityEventType.DESTRUCTIVE_ACTION_DENIED,
            identifier: requestMetadata.targetUserId,
            metadata: { destructiveActionRequestId: request.id, reason: "expired" }
          }
        });
      });
      return { ok: false as const, error: "That destructive-action request expired. Start a new request." };
    }
    if (confirmationDigest(request.id, parsed.data.confirmation) !== requestMetadata.expectedConfirmationDigest) {
      await recordDeleteConfirmationDenied({
        actorUserId,
        targetUserId: requestMetadata.targetUserId,
        destructiveActionRequestId: request.id,
        reason: "confirmation_mismatch"
      });
      return { ok: false as const, error: "Type the confirmation phrase exactly to confirm permanent deletion." };
    }
    const deletePasswordError = requireDeletePasswordValue(parsed.data.deletePassword);
    if (deletePasswordError) {
      await recordDeleteConfirmationDenied({
        actorUserId,
        targetUserId: requestMetadata.targetUserId,
        destructiveActionRequestId: request.id,
        reason: "delete_password_rejected"
      });
      return { ok: false as const, error: deletePasswordError.message };
    }

    const target = await findTargetById(requestMetadata.targetUserId);
    if (!target) return { ok: false as const, error: "User was not found." };
    if (!canActOnTarget(actor, target)) {
      return { ok: false as const, error: "That account is protected from this administrator action." };
    }

    const confirmedAt = new Date();
    const queued = await prisma.$transaction(async (tx) => {
      const lockedUsers = await lockAccountDeletionFenceUsers(tx, [target.id]);
      if (lockedUsers.length !== 1) {
        throw new Error("The account changed while permanent deletion was being confirmed.");
      }
      const securityEvent = await tx.authSecurityEvent.create({
        data: {
          userId: actorUserId,
          type: AuthSecurityEventType.DESTRUCTIVE_ACTION_CONFIRMED,
          identifier: target.id,
          metadata: {
            destructiveActionRequestId: request.id,
            targetType: "User",
            targetId: target.id,
            confirmationMatched: true,
            deletePasswordValidated: true
          }
        }
      });
      const job = await tx.platformJob.create({
        data: {
          kind: ACCOUNT_DATA_CLEANUP_JOB_KIND,
          maxAttempts: 12,
          payload: {
            version: 1,
            destructiveActionRequestId: request.id,
            targetUserId: target.id
          }
        }
      });
      const storageManifest = await persistAccountDeletionStorageManifest(
        tx,
        request.id,
        target.id
      );
      const adTargetSnapshots = await snapshotAdCampaignTargetsForAccountDeletion(
        tx,
        target.id,
        confirmedAt
      );
      await tx.destructiveActionRequest.update({
        where: { id: request.id },
        data: {
          result: {
            ...requestMetadata,
            storageManifest,
            adTargetSnapshots
          } as unknown as Prisma.InputJsonObject
        }
      });
      const claimed = await tx.destructiveActionRequest.updateMany({
        where: {
          id: request.id,
          status: DestructiveActionStatus.PENDING_CONFIRMATION,
          requestedByUserId: actorUserId,
          confirmationSecurityEventId: null,
          platformJobId: null
        },
        data: {
          status: DestructiveActionStatus.QUEUED,
          confirmedByUserId: actorUserId,
          confirmationSecurityEventId: securityEvent.id,
          platformJobId: job.id,
          confirmedAt,
          error: null
        }
      });
      if (claimed.count !== 1) {
        throw new Error("That destructive-action request was already confirmed or changed.");
      }
      const profilesAnonymized = await tx.profile.updateMany({
        where: { userId: target.id },
        data: {
          displayName: "Deleted account",
          tagline: null,
          bio: null,
          avatarUrl: null,
          bannerUrl: null,
          location: null,
          allowProfilePosts: false
        }
      });
      await tx.user.update({
        where: { id: target.id },
        data: {
          email: `deleted+${target.id}@theta-space.local`,
          username: retentionSafeDeletedUsername(target.id),
          passwordHash: null,
          emailVerified: null,
          deactivatedAt: confirmedAt,
          failedLoginCount: 0,
          sessionVersion: { increment: 1 },
          sessionsRevokedAt: confirmedAt
        }
      });
      await writeAuditLog({
        operationId: parsed.data.commandId,
        requestId: request.id,
        actorUserId,
        module: MODULE_KEY,
        action: "account.delete_queued",
        targetType: "User",
        targetId: target.id,
        severity: AuditSeverity.critical,
        before: { active: !target.deactivatedAt },
        after: {
          identityAnonymized: true,
          deactivatedAt: confirmedAt.toISOString(),
          cleanupStatus: DestructiveActionStatus.QUEUED,
          platformJobId: job.id,
          profilesAnonymized: profilesAnonymized.count,
          storageManifest,
          adTargetSnapshots
        },
        metadata: {
          destructiveActionRequestId: request.id,
          reason: requestMetadata.reason,
          retainedProtectedTables: requestMetadata.retainedProtectedTables,
          confirmationSecurityEventId: securityEvent.id,
          storageManifest,
          adTargetSnapshots
        }
      }, tx);
      return {
        jobId: job.id,
        profilesAnonymized: profilesAnonymized.count,
        storageManifest,
        adTargetSnapshots
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return {
      ok: true as const,
      action: "delete-queued" as const,
      destructiveActionRequestId: request.id,
      cleanup: {
        status: DestructiveActionStatus.QUEUED,
        platformJobId: queued.jobId,
        profileRecordsAnonymized: queued.profilesAnonymized,
        storageManifest: queued.storageManifest,
        adTargetSnapshots: queued.adTargetSnapshots
      },
      replayed: false as const
    };
  }

  const target = await findTarget(parsed.data.userIdentifier);
  if (!target) return { ok: false as const, error: "User was not found." };
  if (!canActOnTarget(actor, target)) {
    return { ok: false as const, error: "That account is protected from this administrator action." };
  }

  if (parsed.data.action === "suspend") {
    if (target.deactivatedAt) return { ok: false as const, error: "Account is already suspended." };
    const suspendedAt = new Date();
    const commandId = parsed.data.commandId;
    const reason = parsed.data.reason;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { deactivatedAt: suspendedAt, sessionVersion: { increment: 1 }, sessionsRevokedAt: suspendedAt }
      });
      await writeAuditLog({
        operationId: commandId,
        actorUserId,
        module: MODULE_KEY,
        action: "account.suspended",
        targetType: "User",
        targetId: target.id,
        severity: AuditSeverity.critical,
        before: { deactivatedAt: null },
        after: { deactivatedAt: suspendedAt.toISOString() },
        metadata: { username: target.username, reason, sessionsRevoked: true }
      }, tx);
    });
    return { ok: true as const, action: "suspended" as const, replayed: false as const };
  }

  if (parsed.data.action === "restore") {
    if (!target.deactivatedAt) return { ok: false as const, error: "Account is not suspended." };
    const deletion = await prisma.destructiveActionRequest.findFirst({
      where: {
        kind: DestructiveActionKind.DELETE_ACCOUNT,
        targetType: "User",
        targetId: target.id,
        status: {
          in: [
            DestructiveActionStatus.CONFIRMED,
            DestructiveActionStatus.QUEUED,
            DestructiveActionStatus.RUNNING,
            DestructiveActionStatus.SUCCEEDED
          ]
        }
      },
      select: { status: true }
    });
    if (deletion) {
      return { ok: false as const, error: "An account queued for permanent deletion cannot be restored as a suspension." };
    }
    const restoredAt = new Date();
    const suspendedAt = target.deactivatedAt;
    const commandId = parsed.data.commandId;
    const reason = parsed.data.reason;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { deactivatedAt: null, sessionVersion: { increment: 1 }, sessionsRevokedAt: restoredAt }
      });
      await writeAuditLog({
        operationId: commandId,
        actorUserId,
        module: MODULE_KEY,
        action: "account.restored",
        targetType: "User",
        targetId: target.id,
        severity: AuditSeverity.warning,
        before: { deactivatedAt: suspendedAt.toISOString() },
        after: { deactivatedAt: null },
        metadata: { username: target.username, reason }
      }, tx);
    });
    return { ok: true as const, action: "restored" as const, replayed: false as const };
  }

  if (parsed.data.action !== "request-delete") {
    return { ok: false as const, error: "Unsupported account lifecycle action." };
  }

  const existingDeletion = await prisma.destructiveActionRequest.findFirst({
    where: {
      kind: DestructiveActionKind.DELETE_ACCOUNT,
      targetType: "User",
      targetId: target.id,
      status: { in: [...ACTIVE_DELETE_STATUSES] }
    },
    orderBy: { createdAt: "desc" }
  });
  if (existingDeletion) {
    const existingMetadata = parseDeleteRequestMetadata(existingDeletion.result);
    const expiredPendingRequest =
      existingDeletion.status === DestructiveActionStatus.PENDING_CONFIRMATION &&
      existingMetadata &&
      new Date(existingMetadata.expiresAt).getTime() <= Date.now();
    if (expiredPendingRequest) {
      await prisma.destructiveActionRequest.updateMany({
        where: {
          id: existingDeletion.id,
          status: DestructiveActionStatus.PENDING_CONFIRMATION
        },
        data: {
          status: DestructiveActionStatus.CANCELLED,
          error: "Confirmation window expired before a replacement request was created."
        }
      });
    } else {
      return {
        ok: false as const,
        error: "This account already has an active permanent-deletion request. Complete or cancel it before starting another."
      };
    }
  }

  const deleteCommandId = parsed.data.commandId;
  const deleteReason = parsed.data.reason;
  const expiresAt = new Date(Date.now() + DELETE_REQUEST_TTL_MS);
  const destructiveActionRequestId = randomUUID();
  const expectedConfirmation = `DELETE ${target.username}`;
  const retentionTags = Object.entries(protectedRetentionTables).map(([table, tags]) => ({ table, tags: [...tags] }));
  const metadata: DeleteRequestMetadata = {
    version: 1,
    targetUserId: target.id,
    reason: deleteReason,
    expiresAt: expiresAt.toISOString(),
    expectedConfirmationDigest: confirmationDigest(destructiveActionRequestId, expectedConfirmation),
    mediaAssetCountAtRequest: target._count.mediaAssets,
    retainedProtectedTables: retentionTags,
    preservedModels: [...ACCOUNT_CLEANUP_PRESERVED_MODELS],
    ordinaryModels: [...ACCOUNT_CLEANUP_ORDINARY_MODELS],
    conditionalRetentionRules: ACCOUNT_CLEANUP_CONDITIONAL_RETENTION_RULES.map((entry) => ({
      models: [...entry.models],
      rule: entry.rule
    }))
  };
  let request;
  try {
    request = await prisma.$transaction(async (tx) => {
      const created = await tx.destructiveActionRequest.create({
      data: {
        id: destructiveActionRequestId,
        idempotencyKey: `account-delete:${deleteCommandId}`,
        kind: DestructiveActionKind.DELETE_ACCOUNT,
        status: DestructiveActionStatus.PENDING_CONFIRMATION,
        targetType: "User",
        targetId: target.id,
        reason: deleteReason,
        requestedByUserId: actorUserId,
        result: metadata as unknown as Prisma.InputJsonObject
      }
    });
      await writeAuditLog({
      operationId: deleteCommandId,
      requestId: created.id,
      actorUserId,
      module: MODULE_KEY,
      action: "account.delete_requested",
      targetType: "User",
      targetId: target.id,
      severity: AuditSeverity.critical,
      after: { destructiveActionRequestId: created.id, status: created.status, expiresAt: metadata.expiresAt },
      metadata: {
        destructiveActionRequestId: created.id,
        reason: deleteReason,
        expiresAt: metadata.expiresAt,
        mediaAssetCount: target._count.mediaAssets,
        retainedProtectedTables: retentionTags,
        preservedModels: metadata.preservedModels,
        ordinaryModels: metadata.ordinaryModels,
        conditionalRetentionRules: metadata.conditionalRetentionRules
      }
      }, tx);
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false as const,
        error: "This account already has an active permanent-deletion request. Complete or cancel it before starting another."
      };
    }
    throw error;
  }

  return {
    ok: true as const,
    action: "delete-requested" as const,
    destructiveActionRequestId: request.id,
    expectedConfirmation,
    expiresAt: metadata.expiresAt,
    manifest: {
      mediaAssetsPendingDeletion: target._count.mediaAssets,
      protectedRecordGroupsPreserved: retentionTags.length
    },
    replayed: false as const
  };
}
