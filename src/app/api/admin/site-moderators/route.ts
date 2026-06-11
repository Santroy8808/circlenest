import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { adminModeLockedResponse } from "@/lib/security/admin-mode-guards";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";
import {
  canUserBeSiteModerator,
  ensureBootstrapAdmins,
  isAdminUser,
  logAdminAction,
} from "@/lib/auth/admin";

async function readBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as Record<string, unknown>;
  }
  const formData = await request.formData().catch(() => null);
  if (!formData) return {};
  return Object.fromEntries(formData.entries()) as Record<string, unknown>;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return adminModeLocked;
  const lock = secureAreaLockedResponse(session.user.id);
  if (lock) return lock;

  const rows = await prisma.siteModeratorAssignment.findMany({
    include: {
      user: { select: { id: true, email: true, username: true, role: true, subscriptionTier: true, createdAt: true } },
      invitedBy: { select: { id: true, email: true, username: true } },
      grantedBy: { select: { id: true, email: true, username: true } },
      revokedBy: { select: { id: true, email: true, username: true } },
    },
    orderBy: [{ status: "asc" }, { invitedAt: "desc" }],
  });

  return NextResponse.json({
    assignments: rows.map((row) => ({
      id: row.id,
      status: row.status,
      reason: row.reason,
      invitedAt: row.invitedAt.toISOString(),
      grantedAt: row.grantedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      user: {
        id: row.user.id,
        email: row.user.email,
        username: row.user.username,
        role: row.user.role,
        subscriptionTier: row.user.subscriptionTier,
        createdAt: row.user.createdAt.toISOString(),
      },
      invitedBy: row.invitedBy ? { username: row.invitedBy.username, email: row.invitedBy.email } : null,
      grantedBy: row.grantedBy ? { username: row.grantedBy.username, email: row.grantedBy.email } : null,
      revokedBy: row.revokedBy ? { username: row.revokedBy.username, email: row.revokedBy.email } : null,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return adminModeLocked;
  const lock = secureAreaLockedResponse(session.user.id);
  if (lock) return lock;

  const body = await readBody(request);
  const userId = String(body.userId ?? "").trim();
  const identifier = String(body.identifier ?? "").trim().toLowerCase();
  const note = String(body.note ?? "").trim() || null;
  if (!userId && !identifier) return NextResponse.json({ error: "Missing user" }, { status: 400 });

  const target = await prisma.user.findFirst({
    where: userId
      ? { id: userId }
      : {
          OR: [{ email: identifier }, { username: identifier }],
        },
    select: { id: true, email: true, username: true, role: true, subscriptionTier: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!(await canUserBeSiteModerator(target.id))) {
    return NextResponse.json({ error: "User not eligible" }, { status: 403 });
  }

  const existing = await prisma.siteModeratorAssignment.findUnique({ where: { userId: target.id } });
  if (existing?.status === "ACTIVE") {
    return NextResponse.json({ error: "Already active" }, { status: 409 });
  }

  const assignment = await prisma.siteModeratorAssignment.upsert({
    where: { userId: target.id },
    create: {
      userId: target.id,
      invitedById: session.user.id,
      status: "PENDING",
      reason: note,
    },
    update: {
      invitedById: session.user.id,
      status: "PENDING",
      reason: note,
      invitedAt: new Date(),
      grantedAt: null,
      revokedAt: null,
      grantedById: null,
      revokedById: null,
    },
    select: { id: true, status: true },
  });

  await logAdminAction({
    actorUserId: session.user.id,
    action: "INVITE_SITE_MODERATOR",
    targetType: "USER",
    targetId: target.id,
    note: note ?? target.username ?? target.email,
  });

  return NextResponse.redirect(new URL(`/admin?siteModerator=${assignment.id}`, request.url));
}
