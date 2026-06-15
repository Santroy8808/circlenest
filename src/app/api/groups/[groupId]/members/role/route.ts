import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { canModerateGroup } from "@/lib/auth/scoped-moderation";
import { canAssignGroupModerators, resolveUserAccessPolicy } from "@/lib/policy/tier-policy";

export async function PATCH(request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, subscriptionTier: true },
  });
  const policy = resolveUserAccessPolicy(user);

  const body = (await request.json()) as { userId?: string; role?: "MODERATOR" | "MEMBER"; isProvider?: boolean };
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (!body.role && typeof body.isProvider !== "boolean") {
    return NextResponse.json({ error: "role or isProvider required" }, { status: 400 });
  }
  if (body.role === "MODERATOR" && !canAssignGroupModerators(policy)) {
    return NextResponse.json({ error: "Assigning moderators is not allowed on this tier." }, { status: 403 });
  }

  const allowed = await canModerateGroup(session.user.id, context.params.groupId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.groupMember.update({
    where: { groupId_userId: { groupId: context.params.groupId, userId: body.userId } },
    data: {
      ...(body.role ? { role: body.role } : {}),
      ...(typeof body.isProvider === "boolean" ? { isProvider: body.isProvider } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
