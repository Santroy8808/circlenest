import { AuditSeverity, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import {
  protectedRetentionTables,
  requireDeletePasswordValue
} from "@/lib/platform/delete-protection";
import { isAdminRole } from "@/lib/platform/roles";

const MODULE_KEY = "admin-account-lifecycle";

const lifecycleSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suspend"),
    userIdentifier: z.string().trim().min(1).max(160),
    reason: z.string().trim().min(5).max(500)
  }),
  z.object({
    action: z.literal("restore"),
    userIdentifier: z.string().trim().min(1).max(160),
    reason: z.string().trim().min(5).max(500)
  }),
  z.object({
    action: z.literal("delete"),
    userIdentifier: z.string().trim().min(1).max(160),
    reason: z.string().trim().min(5).max(500),
    confirmation: z.string().trim().min(1).max(180),
    deletePassword: z.string().min(1).max(120)
  })
]);

type StoredMediaAsset = {
  storageKey: string;
  visibility: string;
  metadata: Prisma.JsonValue | null;
};

function normalizeIdentifier(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function retentionSafeDeletedUsername(username: string, userId: string) {
  const suffix = userId.slice(-8).toLowerCase();
  return `deleted-${username}-${suffix}`.slice(0, 80);
}

async function isAdminUser(userId?: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return isAdminRole(user?.role);
}

async function findTarget(identifier: string) {
  const normalized = normalizeIdentifier(identifier);

  return prisma.user.findFirst({
    where: { OR: [{ email: normalized }, { username: normalized }] },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      deactivatedAt: true,
      mediaAssets: { select: { storageKey: true, visibility: true, metadata: true } }
    }
  });
}

export async function changeAccountLifecycle(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = lifecycleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid account action." };
  }

  const target = await findTarget(parsed.data.userIdentifier);
  if (!target) return { ok: false as const, error: "User was not found." };
  if (target.id === actorUserId) return { ok: false as const, error: "You cannot suspend or delete your own admin account." };
  if (target.role === UserRole.ADMIN || target.role === UserRole.GOD) {
    return { ok: false as const, error: "Admin and God accounts require a separate protected workflow." };
  }

  if (parsed.data.action === "suspend") {
    if (target.deactivatedAt) return { ok: false as const, error: "Account is already suspended." };
    const suspendedAt = new Date();
    await prisma.user.update({
      where: { id: target.id },
      data: { deactivatedAt: suspendedAt, sessionVersion: { increment: 1 }, sessionsRevokedAt: suspendedAt }
    });
    await writeAuditLog({
      actorUserId,
      module: MODULE_KEY,
      action: "account.suspended",
      targetType: "User",
      targetId: target.id,
      severity: AuditSeverity.critical,
      metadata: { username: target.username, reason: parsed.data.reason, suspendedAt: suspendedAt.toISOString() }
    });
    return { ok: true as const, action: "suspended" as const };
  }

  if (parsed.data.action === "restore") {
    if (!target.deactivatedAt) return { ok: false as const, error: "Account is not suspended." };
    await prisma.user.update({
      where: { id: target.id },
      data: { deactivatedAt: null, sessionVersion: { increment: 1 }, sessionsRevokedAt: new Date() }
    });
    await writeAuditLog({
      actorUserId,
      module: MODULE_KEY,
      action: "account.restored",
      targetType: "User",
      targetId: target.id,
      severity: AuditSeverity.warning,
      metadata: { username: target.username, reason: parsed.data.reason }
    });
    return { ok: true as const, action: "restored" as const };
  }

  const expectedConfirmation = `DELETE ${target.username}`;
  if (parsed.data.confirmation !== expectedConfirmation) {
    return { ok: false as const, error: `Type ${expectedConfirmation} exactly to confirm permanent deletion.` };
  }

  const deletePasswordError = requireDeletePasswordValue(parsed.data.deletePassword);
  if (deletePasswordError) {
    return { ok: false as const, error: deletePasswordError.message };
  }

  const assets = target.mediaAssets as StoredMediaAsset[];
  const deletedAt = new Date();
  const retentionTags = Object.entries(protectedRetentionTables).map(([table, tags]) => ({ table, tags }));

  await prisma.$transaction(async (tx) => {
    await tx.adminAction.create({
      data: {
        actorUserId,
        actionKey: "account-retention-protected-delete",
        module: MODULE_KEY,
        status: "completed",
        metadata: {
          targetUserId: target.id,
          username: target.username,
          email: target.email,
          reason: parsed.data.reason,
          mediaAssetCount: assets.length,
          retainedProtectedTables: retentionTags,
          deletedAt: deletedAt.toISOString()
        } as Prisma.InputJsonObject
      }
    });
    await tx.profile.updateMany({
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
        username: retentionSafeDeletedUsername(target.username, target.id),
        passwordHash: null,
        emailVerified: null,
        deactivatedAt: deletedAt,
        failedLoginCount: 0,
        sessionVersion: { increment: 1 },
        sessionsRevokedAt: deletedAt
      }
    });
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "account.retention_protected_deleted",
    targetType: "User",
    targetId: target.id,
    severity: AuditSeverity.critical,
    metadata: {
      username: target.username,
      email: target.email,
      reason: parsed.data.reason,
      mediaAssetCount: assets.length,
      retainedProtectedTables: retentionTags,
      deletedAt: deletedAt.toISOString()
    }
  });

  return { ok: true as const, action: "retention-protected-deleted" as const, cleanupFailures: 0 };
}
