import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { ensureBootstrapAdmins, isAdminUser, logAdminAction, normalizeManagedSubscriptionTier } from "@/lib/auth/admin";
import { adminModeLockedResponse } from "@/lib/security/admin-mode-guards";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return adminModeLocked;
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get("q") ?? "").trim();

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q } },
            { username: { contains: q } },
            { fullName: { contains: q } },
          ],
        }
      : undefined,
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      subscriptionTier: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ users });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return adminModeLocked;
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const body = (await request.json()) as { userId?: string; subscriptionTier?: string };
  const userId = String(body.userId ?? "").trim();
  const nextTier = normalizeManagedSubscriptionTier(body.subscriptionTier);
  if (!userId || !nextTier) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, role: true, subscriptionTier: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.subscriptionTier === nextTier) {
    return NextResponse.json({ ok: true, user: target });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { subscriptionTier: nextTier },
    select: { id: true, email: true, username: true, role: true, subscriptionTier: true, createdAt: true },
  });

  await logAdminAction({
    actorUserId: session.user.id,
    action: "CHANGE_TIER",
    targetType: "USER",
    targetId: target.id,
    note: `${target.subscriptionTier} -> ${nextTier}`,
  });

  return NextResponse.json({ ok: true, user: updated });
}
