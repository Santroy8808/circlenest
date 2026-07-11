import { AuditSeverity, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { deleteR2Object } from "@/lib/platform/r2";
import { diagnostics } from "@/lib/platform/logging";
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
    confirmation: z.string().trim().min(1).max(180)
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

function mediaStorageKeys(asset: StoredMediaAsset) {
  const metadata = asset.metadata;
  const thumbnailStorageKey = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).thumbnailStorageKey
    : undefined;

  return [asset.storageKey, typeof thumbnailStorageKey === "string" ? thumbnailStorageKey : null].filter(
    (key): key is string => Boolean(key)
  );
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

  const assets = target.mediaAssets as StoredMediaAsset[];
  await prisma.$transaction(async (tx) => {
    await tx.adminAction.create({
      data: {
        actorUserId,
        actionKey: "account-delete",
        module: MODULE_KEY,
        status: "completed",
        metadata: {
          targetUserId: target.id,
          username: target.username,
          email: target.email,
          reason: parsed.data.reason,
          mediaAssetCount: assets.length
        } as Prisma.InputJsonObject
      }
    });
    await tx.user.delete({ where: { id: target.id } });
  });

  const storageKeys = assets.flatMap(mediaStorageKeys);
  const cleanupResults = await Promise.allSettled(
    assets.flatMap((asset) => mediaStorageKeys(asset).map((storageKey) => deleteR2Object(storageKey, asset.visibility === "PUBLIC" ? "public" : "private")))
  );
  const cleanupFailures = cleanupResults.filter((result) => result.status === "rejected").length;

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "account.deleted",
    targetType: "User",
    targetId: target.id,
    severity: AuditSeverity.critical,
    metadata: {
      username: target.username,
      email: target.email,
      reason: parsed.data.reason,
      mediaAssetCount: assets.length,
      storageObjectCount: storageKeys.length,
      storageCleanupFailures: cleanupFailures
    }
  });

  if (cleanupFailures > 0) {
    await diagnostics.error(MODULE_KEY, "Some account media objects could not be removed after account deletion.", {
      targetUserId: target.id,
      cleanupFailures
    });
  }

  return { ok: true as const, action: "deleted" as const, cleanupFailures };
}
