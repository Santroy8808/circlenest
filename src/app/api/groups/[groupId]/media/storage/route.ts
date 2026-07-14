import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { requireDeletePasswordFromBodyOrRequest } from "@/lib/platform/delete-protection";
import { purgeGroupStorage, updateGroupStorageLimit } from "@/modules/group-media-docs/group-media-docs.service";

export async function PATCH(request: NextRequest, { params }: { params: { groupId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;
  const deletePasswordError = requireDeletePasswordFromBodyOrRequest(body.value, request);
  if (deletePasswordError) return deletePasswordError;

  const actor = await getActiveAccountActor(session.user.id);
  const result = await updateGroupStorageLimit(actor.actorUserId, params.groupId, body.value);

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}

export async function POST(request: NextRequest, { params }: { params: { groupId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;

  const actor = await getActiveAccountActor(session.user.id);
  const result = await purgeGroupStorage(actor.actorUserId, session.user.id, params.groupId, body.value);

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json({
    ...result,
    freedBytes: result.freedBytes.toString()
  });
}
