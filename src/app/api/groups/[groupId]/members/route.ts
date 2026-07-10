import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { addGroupMember, listGroupMembers } from "@/modules/groups/groups.service";
import { MAX_GROUP_IDENTIFIER_LENGTH, MAX_GROUP_MEMBER_PAGE_SIZE } from "@/modules/groups/types";

function parsePageLimit(value: string | null) {
  if (value === null) return { ok: true as const, value: undefined };
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_GROUP_MEMBER_PAGE_SIZE
    ? { ok: true as const, value: limit }
    : { ok: false as const };
}

export async function GET(request: NextRequest, { params }: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const limit = parsePageLimit(request.nextUrl.searchParams.get("limit"));
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (!limit.ok || (cursor !== null && cursor.length > MAX_GROUP_IDENTIFIER_LENGTH)) {
    return NextResponse.json({ error: "Invalid member page." }, { status: 400 });
  }

  const actor = await getActiveAccountActor(session.user.id);
  const result = await listGroupMembers(actor.actorUserId, params.groupId, {
    cursor,
    limit: limit.value
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json(result.page);
}

export async function POST(request: NextRequest, { params }: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;

  const actor = await getActiveAccountActor(session.user.id);
  const result = await addGroupMember(actor.actorUserId, params.groupId, body.value);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: result.status === "added" ? 201 : 200 });
}
