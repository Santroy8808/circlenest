import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureBootstrapAdmins, isAdminUser, logAdminAction } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { adminModeLockedResponse } from "@/lib/security/admin-mode-guards";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

const ALLOWED_ACTIONS = new Set(["HOLD", "RELEASE", "APPROVE", "CANCEL", "REVIEW"]);

export async function PATCH(request: Request, { params }: { params: { withdrawalId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return adminModeLocked;
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const body = (await request.json().catch(() => ({}))) as { action?: string; note?: string };
  const action = String(body.action ?? "").trim().toUpperCase();
  const note = String(body.note ?? "").trim();
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Unsupported withdrawal action." }, { status: 400 });
  }

  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where: { id: params.withdrawalId },
    select: { id: true, status: true, processorTransferId: true },
  });
  if (!withdrawal) return NextResponse.json({ error: "Withdrawal not found." }, { status: 404 });
  if (withdrawal.status === "COMPLETED" || withdrawal.status === "SENT_TO_PROCESSOR") {
    return NextResponse.json({ error: "Processor-controlled withdrawals cannot be manually changed here." }, { status: 409 });
  }

  const nextStatus = action === "HOLD" ? "HOLD" : action === "RELEASE" ? "PENDING" : action === "APPROVE" ? "APPROVED" : action === "CANCEL" ? "CANCELED" : "PENDING";
  const updated = await prisma.withdrawalRequest.update({
    where: { id: withdrawal.id },
    data: {
      status: nextStatus,
      reviewedAt: new Date(),
      reviewedById: session.user.id,
      holdReason: action === "HOLD" ? note || "Placed on hold by admin." : action === "RELEASE" ? null : undefined,
      note: note || undefined,
    },
  });

  await logAdminAction({
    actorUserId: session.user.id,
    action: `WITHDRAWAL_${action}`,
    targetType: "WITHDRAWAL_REQUEST",
    targetId: withdrawal.id,
    note: note || `${withdrawal.status} -> ${updated.status}`,
  });

  return NextResponse.json({
    withdrawal: {
      id: updated.id,
      status: updated.status,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      reviewedById: updated.reviewedById,
      holdReason: updated.holdReason,
      note: updated.note,
    },
  });
}
