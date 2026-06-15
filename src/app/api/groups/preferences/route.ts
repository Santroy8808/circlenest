import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateGroupMembershipPreference } from "@/modules/groups/group-preferences.service";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { groupId?: string; action?: string } | null;
  if (!body?.groupId || !body?.action) {
    return NextResponse.json({ error: "groupId and action required" }, { status: 400 });
  }

  if (!["pin", "unpin", "move-up", "move-down"].includes(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    await updateGroupMembershipPreference(session.user.id, body.groupId, body.action as "pin" | "unpin" | "move-up" | "move-down");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update group order" }, { status: 400 });
  }
}
