import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { adminModeLockedResponse } from "@/lib/security/admin-mode-guards";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";
import { canUserBeSiteModerator, ensureBootstrapAdmins, isAdminUser, logAdminAction } from "@/lib/auth/admin";

type RouteContext = {
  params: Promise<{ assignmentId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return adminModeLocked;
  const lock = secureAreaLockedResponse(session.user.id);
  if (lock) return lock;

  const { assignmentId } = await context.params;
  const assignment = await prisma.siteModeratorAssignment.findUnique({
    where: { id: assignmentId },
    include: { user: { select: { id: true, email: true, username: true, role: true, subscriptionTier: true } } },
  });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canUserBeSiteModerator(assignment.userId))) return NextResponse.json({ error: "User not eligible" }, { status: 403 });
  if (assignment.status === "ACTIVE") return NextResponse.json({ error: "Already active" }, { status: 409 });

  await prisma.siteModeratorAssignment.update({
    where: { id: assignment.id },
    data: {
      status: "ACTIVE",
      grantedById: session.user.id,
      grantedAt: new Date(),
      revokedById: null,
      revokedAt: null,
    },
  });

  await logAdminAction({
    actorUserId: session.user.id,
    action: "GRANT_SITE_MODERATOR",
    targetType: "USER",
    targetId: assignment.userId,
    note: assignment.user.username ?? assignment.user.email,
  });

  return NextResponse.redirect(new URL("/admin?siteModerator=granted", _request.url));
}
