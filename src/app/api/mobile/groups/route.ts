import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { createGroup, getGroupProfile, listGroupsPage } from "@/modules/groups/groups.service";
import {
  MAX_GROUP_DIRECTORY_PAGE_SIZE,
  MAX_GROUP_DIRECTORY_QUERY_LENGTH,
  MAX_GROUP_IDENTIFIER_LENGTH
} from "@/modules/groups/types";

function parsePageLimit(value: string | null) {
  if (value === null) return { ok: true as const, value: undefined };
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_GROUP_DIRECTORY_PAGE_SIZE
    ? { ok: true as const, value: limit }
    : { ok: false as const };
}

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const groupId = request.nextUrl.searchParams.get("groupId");
  if (groupId) {
    const result = await getGroupProfile(session.user.id, groupId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ group: result.group });
  }

  const limit = parsePageLimit(request.nextUrl.searchParams.get("limit"));
  const cursor = request.nextUrl.searchParams.get("cursor");
  const query = request.nextUrl.searchParams.get("q");
  if (
    !limit.ok ||
    (cursor !== null && cursor.length > MAX_GROUP_IDENTIFIER_LENGTH) ||
    (query !== null && query.length > MAX_GROUP_DIRECTORY_QUERY_LENGTH)
  ) {
    return NextResponse.json({ error: "Invalid group directory request." }, { status: 400 });
  }

  const page = await listGroupsPage({
    viewerUserId: session.user.id,
    mode: request.nextUrl.searchParams.get("mode"),
    query,
    cursor,
    limit: limit.value
  });

  return NextResponse.json(page);
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const body = await readJsonRequest(request);
  if (!body.ok) return body.response;

  const result = await createGroup(session.user.id, body.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ group: result.group }, { status: 201 });
}
