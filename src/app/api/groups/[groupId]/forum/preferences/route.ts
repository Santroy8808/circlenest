import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { updateGroupThreadPreference } from "@/modules/groups/group-preferences.service";

export async function PATCH(request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } },
    select: { id: true },
  });
  if (!membership) return NextResponse.json({ error: "Join group first" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { threadId?: string; action?: string } | null;
  if (!body?.threadId || !body?.action) {
    return NextResponse.json({ error: "threadId and action required" }, { status: 400 });
  }

  if (!["pin", "unpin", "move-up", "move-down"].includes(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    await updateGroupThreadPreference(
      session.user.id,
      context.params.groupId,
      body.threadId,
      body.action as "pin" | "unpin" | "move-up" | "move-down",
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update thread order" }, { status: 400 });
  }
}
