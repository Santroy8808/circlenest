import { Prisma } from "@prisma/client";
import { isEnabled } from "@/lib/platform/env";
import { prisma } from "@/lib/platform/db";

type AuditInput = {
  actorUserId?: string;
  module: string;
  action: string;
  targetType?: string;
  targetId?: string;
  severity?: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(input: AuditInput) {
  if (!isEnabled(process.env.AUDIT_LOGS_ENABLED, true)) return;

  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      module: input.module,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      severity: input.severity ?? "info",
      metadata: input.metadata as Prisma.InputJsonObject | undefined
    }
  });
}
