import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { writeAuditLog } from "@/lib/platform/audit";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/modules/auth-security/password";
import { resetDeletePasswordCache } from "@/lib/platform/delete-protection";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";

const MODULE_KEY = "delete-protection";
const DELETE_PROTECTION_CONFIG_ID = "default";

export type DeleteProtectionAdminView = {
  canAccess: boolean;
  mode: "fallback" | "custom";
  configuredAt: string | null;
  updatedByUserId: string | null;
  updatedByLabel: string | null;
  currentSource: string;
};

function cleanReason(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\r\n/g, "\n").slice(0, 1000) : "";
}

function cleanPassword(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function passwordLabel(user: { username: string; profile?: { displayName: string | null } | null } | null) {
  return user?.profile?.displayName ?? user?.username ?? null;
}

export async function getDeleteProtectionAdminView(userId?: string): Promise<DeleteProtectionAdminView> {
  if (!(await isAdminUser(userId))) {
    return {
      canAccess: false,
      mode: "fallback",
      configuredAt: null,
      updatedByUserId: null,
      updatedByLabel: null,
      currentSource: "DELETE / DELETE_CONFIRMATION_PASSWORD env fallback"
    };
  }

  const config = await prisma.deleteProtectionConfig.findUnique({
    where: { id: DELETE_PROTECTION_CONFIG_ID },
    select: {
      deletePasswordHash: true,
      updatedAt: true,
      updatedByUserId: true,
      updatedBy: {
        select: {
          username: true,
          profile: {
            select: {
              displayName: true
            }
          }
        }
      }
    }
  });

  const mode = config?.deletePasswordHash ? "custom" : "fallback";
  return {
    canAccess: true,
    mode,
    configuredAt: config?.updatedAt.toISOString() ?? null,
    updatedByUserId: config?.updatedByUserId ?? null,
    updatedByLabel: passwordLabel(config?.updatedBy ?? null),
    currentSource: mode === "custom" ? "database override" : "DELETE / DELETE_CONFIRMATION_PASSWORD env fallback"
  };
}

export async function updateDeleteProtectionPassword(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const body = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const password = cleanPassword(body.password);
  const deletePassword = cleanPassword(body.deletePassword ?? body.newDeletePassword);
  const reason = cleanReason(body.reason);

  if (!password || !deletePassword) {
    return { ok: false as const, error: "Your account password and the new DELETE password are required." };
  }

  if (reason.length < 10) {
    return { ok: false as const, error: "Enter a specific reason of at least 10 characters." };
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { passwordHash: true }
  });

  if (!actor?.passwordHash || !(await verifyPassword(password, actor.passwordHash))) {
    return { ok: false as const, error: "Your account password was not correct." };
  }

  const policy = validatePasswordStrength(deletePassword);
  if (!policy.valid) {
    return { ok: false as const, error: policy.issues.join(" ") };
  }

  const deletePasswordHash = await hashPassword(deletePassword);

  const saved = await prisma.$transaction(async (transaction) => {
    const record = await transaction.deleteProtectionConfig.upsert({
      where: { id: DELETE_PROTECTION_CONFIG_ID },
      update: {
        deletePasswordHash,
        updatedByUserId: actorUserId
      },
      create: {
        id: DELETE_PROTECTION_CONFIG_ID,
        deletePasswordHash,
        updatedByUserId: actorUserId
      }
    });

    await transaction.adminAction.create({
      data: {
        actorUserId,
        actionKey: "delete-password",
        module: MODULE_KEY,
        status: "completed",
        metadata: { reason } as Prisma.InputJsonObject
      }
    });

    await transaction.auditLog.create({
      data: {
        actorUserId,
        module: MODULE_KEY,
        action: "delete_password_updated",
        targetType: "DeleteProtectionConfig",
        targetId: record.id,
        severity: "critical",
        metadata: { reason } as Prisma.InputJsonObject
      }
    });

    return record;
  });

  resetDeletePasswordCache();

  return {
    ok: true as const,
    saved,
    view: await getDeleteProtectionAdminView(actorUserId)
  };
}
