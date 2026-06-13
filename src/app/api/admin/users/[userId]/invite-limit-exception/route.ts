import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { ensureBootstrapAdmins, isAdminUser, logAdminAction } from "@/lib/auth/admin";
import { adminModeLockedResponse } from "@/lib/security/admin-mode-guards";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

const inviteLimitExceptionSchema = z.object({
  enabled: z.boolean(),
});

export async function PATCH(request: Request, context: { params: { userId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return adminModeLocked;
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return locked;

  const body = inviteLimitExceptionSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: context.params.userId },
    select: { id: true, email: true, username: true, inviteLimitException: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (user.inviteLimitException === body.data.enabled) {
    return NextResponse.json({ ok: true, user });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { inviteLimitException: body.data.enabled },
    select: { id: true, email: true, username: true, inviteLimitException: true },
  });

  await logAdminAction({
    actorUserId: session.user.id,
    action: body.data.enabled ? "SET_INVITE_LIMIT_EXCEPTION" : "CLEAR_INVITE_LIMIT_EXCEPTION",
    targetType: "USER",
    targetId: user.id,
    note: user.username ?? user.email,
  });

  return NextResponse.json({ ok: true, user: updated });
}
