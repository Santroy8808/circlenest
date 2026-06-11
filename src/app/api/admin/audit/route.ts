import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { ensureBootstrapAdmins, isAdminUser } from "@/lib/auth/admin";
import { adminModeLockedResponse } from "@/lib/security/admin-mode-guards";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return adminModeLocked;
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const rows = await prisma.moderatorActionLog.findMany({
    include: { actor: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return adminModeLocked;
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const body = (await request.json()) as { action?: string; targetType?: string; targetId?: string; note?: string };
  const action = String(body.action ?? "").trim();
  const targetType = String(body.targetType ?? "").trim();
  const targetId = String(body.targetId ?? "").trim();
  if (!action || !targetType || !targetId) {
    return NextResponse.json({ error: "action, targetType, and targetId are required" }, { status: 400 });
  }

  const row = await prisma.moderatorActionLog.create({
    data: {
      actorUserId: session.user.id,
      action,
      targetType,
      targetId,
      note: String(body.note ?? "").trim() || null,
    },
    include: { actor: { select: { username: true } } },
  });
  return NextResponse.json(row);
}
