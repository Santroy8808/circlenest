import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { requireDeletePasswordFromRequest } from "@/lib/platform/delete-protection";
import { removeGroupMember, updateGroupMemberRole } from "@/modules/groups/groups.service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { groupId: string; memberId: string } }
) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const parsedBody = await readJsonRequest(request);
  if (!parsedBody.ok) return parsedBody.response;
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Invalid role change." }, { status: 400 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const result = await updateGroupMemberRole(actor.actorUserId, params.groupId, {
    ...parsedBody.value,
    targetUserId: params.memberId
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest, { params }: { params: { groupId: string; memberId: string } }) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }
  const deletePasswordError = requireDeletePasswordFromRequest(request);
  if (deletePasswordError) return deletePasswordError;

  const actor = await getActiveAccountActor(session.user.id);
  const result = await removeGroupMember(actor.actorUserId, params.groupId, {
    targetUserId: params.memberId
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
