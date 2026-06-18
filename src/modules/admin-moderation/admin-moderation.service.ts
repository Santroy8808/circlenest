import { Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import type { AdminActionCard, AdminLogView, AdminPortalView } from "@/modules/admin-moderation/types";

const MODULE_KEY = "admin-moderation";

export const adminActionCards: AdminActionCard[] = [
  {
    key: "session-revocation",
    title: "Session Revocation",
    description: "Force-log-out a compromised or suspicious user by revoking active sessions.",
    risk: "high",
    steps: ["Find the user.", "Review recent login/security activity.", "Confirm revocation reason.", "Revoke sessions and write audit log."]
  },
  {
    key: "email-verification-resend",
    title: "Email Verification Resend",
    description: "Resend verification emails for users stuck during signup.",
    risk: "low",
    steps: ["Find the user.", "Confirm email address.", "Send verification email.", "Log support action."]
  },
  {
    key: "feature-flags",
    title: "Feature Flags",
    description: "Turn risky or unfinished modules on/off without redeploying.",
    risk: "medium",
    steps: ["Choose feature key.", "Set enabled state.", "Describe reason.", "Save flag and write audit log."]
  },
  {
    key: "view-as-role",
    title: "View As Role",
    description: "Preview Free, Contributor, Professional, Auditor, or Admin visibility without impersonating users.",
    risk: "low",
    steps: ["Pick role/tier.", "Open read-only preview.", "Do not perform actions as the user.", "Exit preview mode."]
  },
  {
    key: "audit-viewer",
    title: "Audit Viewer",
    description: "Review privileged actions and module audit history.",
    risk: "medium",
    steps: ["Choose module/action filter.", "Inspect audit trail.", "Attach support note if needed.", "Escalate if critical."]
  },
  {
    key: "reports-queue",
    title: "Reports Queue",
    description: "Review abuse reports, content reports, and support tickets.",
    risk: "medium",
    steps: ["Open report.", "Review content and reporter specifics.", "Choose disposition.", "Notify relevant users."]
  },
  {
    key: "business-verification",
    title: "Business Verification",
    description: "Approve, reject, request changes, or place business profiles on hold.",
    risk: "medium",
    steps: ["Open business profile.", "Review verification evidence.", "Choose outcome.", "Write internal note."]
  },
  {
    key: "announcements",
    title: "Public Announcements",
    description: "Send global, tier-specific, or targeted platform notices.",
    risk: "high",
    steps: ["Choose audience.", "Draft notice.", "Preview delivery.", "Publish and audit."]
  }
];

export async function isAdminUser(userId?: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return user?.role === UserRole.ADMIN;
}

function toAuditLogView(log: {
  id: string;
  module: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: Date;
}): AdminLogView {
  return {
    id: log.id,
    label: `${log.module} · ${log.action}`,
    detail: [log.targetType, log.targetId].filter(Boolean).join(" ") || "No target",
    createdAt: log.createdAt.toISOString()
  };
}

function toDiagnosticLogView(log: { id: string; level: string; module: string; message: string; createdAt: Date }): AdminLogView {
  return {
    id: log.id,
    label: `${log.level.toUpperCase()} · ${log.module}`,
    detail: log.message,
    createdAt: log.createdAt.toISOString()
  };
}

export async function getAdminPortalView(userId?: string): Promise<AdminPortalView> {
  if (!(await isAdminUser(userId))) {
    return {
      canAccess: false,
      actions: [],
      featureFlags: [],
      recentAuditLogs: [],
      recentDiagnostics: []
    };
  }

  const [featureFlags, auditLogs, diagnosticsLogs] = await Promise.all([
    prisma.featureFlag.findMany({
      orderBy: { key: "asc" },
      take: 80
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.diagnosticLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);

  return {
    canAccess: true,
    actions: adminActionCards,
    featureFlags: featureFlags.map((flag) => ({
      key: flag.key,
      enabled: flag.enabled,
      description: flag.description
    })),
    recentAuditLogs: auditLogs.map(toAuditLogView),
    recentDiagnostics: diagnosticsLogs.map(toDiagnosticLogView)
  };
}

export function getAdminActionCard(actionKey: string) {
  return adminActionCards.find((action) => action.key === actionKey) ?? null;
}

export async function setFeatureFlag(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const body = input as { key?: unknown; enabled?: unknown; description?: unknown };
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const enabled = Boolean(body.enabled);
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (!/^[a-z0-9._:-]{2,80}$/i.test(key)) {
    return { ok: false as const, error: "Feature key must be 2-80 letters, numbers, dots, dashes, colons, or underscores." };
  }

  const flag = await prisma.featureFlag.upsert({
    where: { key },
    update: {
      enabled,
      description: description || null
    },
    create: {
      key,
      enabled,
      description: description || null
    }
  });

  await prisma.adminAction.create({
    data: {
      actorUserId,
      actionKey: "feature-flags",
      module: MODULE_KEY,
      status: "completed",
      metadata: {
        key,
        enabled
      } as Prisma.InputJsonObject
    }
  });
  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "feature-flag.set",
    targetType: "FeatureFlag",
    targetId: flag.id,
    severity: "warning",
    metadata: { key, enabled }
  });
  await diagnostics.info(MODULE_KEY, "Feature flag updated.", { actorUserId, key, enabled });

  return { ok: true as const, flag };
}
