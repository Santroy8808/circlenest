import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { ensureBootstrapAdmins, isAdminUser } from "@/lib/auth/admin";
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
  const status = String(searchParams.get("status") ?? "").trim().toUpperCase();

  const invitations = await prisma.membershipInvitation.findMany({
    where: {
      AND: [
        status
          ? {
              status,
            }
          : {},
        q
          ? {
              OR: [
                { inviteeEmail: { contains: q } },
                { inviteeName: { contains: q } },
                { currentOrg: { contains: q } },
                { lastServiceName: { contains: q } },
                { inviter: { email: { contains: q } } },
                { inviter: { username: { contains: q } } },
              ],
            }
          : {},
      ],
    },
    include: {
      inviter: { select: { id: true, email: true, username: true } },
      inviteeUser: { select: { id: true, email: true, username: true } },
      reviewedBy: { select: { id: true, email: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ invitations });
}
