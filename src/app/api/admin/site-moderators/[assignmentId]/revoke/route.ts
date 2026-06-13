import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { adminModeLockedResponse } from "@/lib/security/admin-mode-guards";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";
import { ensureBootstrapAdmins, isAdminUser, logAdminAction } from "@/lib/auth/admin";

type RouteContext = {
  params: Promise<{ assignmentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
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
    include: { user: { select: { id: true, email: true, username: true } } },
  });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (assignment.status === "REVOKED") return NextResponse.json({ error: "Already revoked" }, { status: 409 });

  await prisma.siteModeratorAssignment.update({
    where: { id: assignment.id },
    data: {
      status: "REVOKED",
      revokedById: session.user.id,
      revokedAt: new Date(),
      grantedById: assignment.grantedById ?? null,
      grantedAt: assignment.grantedAt ?? null,
    },
  });

  await logAdminAction({
    actorUserId: session.user.id,
    action: "REVOKE_SITE_MODERATOR",
    targetType: "USER",
    targetId: assignment.userId,
    note: assignment.user.username ?? assignment.user.email,
  });

  return NextResponse.redirect(new URL("/admin?siteModerator=revoked", request.url));
}
