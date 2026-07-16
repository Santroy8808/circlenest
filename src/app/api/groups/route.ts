import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { readJsonRequest } from "@/lib/platform/api-request";
import { diagnostics } from "@/lib/platform/logging";
import { createGroup, listGroupsPage } from "@/modules/groups/groups.service";
import {
  MAX_GROUP_DIRECTORY_PAGE_SIZE,
  MAX_GROUP_DIRECTORY_QUERY_LENGTH,
  MAX_GROUP_IDENTIFIER_LENGTH
} from "@/modules/groups/types";

function parsePageLimit(value: string | null) {
  if (value === null) return { ok: true as const, value: undefined };

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_GROUP_DIRECTORY_PAGE_SIZE) {
    return { ok: false as const };
  }

  return { ok: true as const, value: limit };
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const actor = await getActiveAccountActor(session.user.id);
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
    viewerUserId: actor.actorUserId,
    mode: request.nextUrl.searchParams.get("mode"),
    query,
    cursor,
    limit: limit.value
  });

  return NextResponse.json(page);
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  try {
    const actor = await getActiveAccountActor(session.user.id);
    const body = await readJsonRequest(request);
    if (!body.ok) return body.response;

    const result = await createGroup(actor.actorUserId, body.value);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ group: result.group }, { status: 201 });
  } catch (error) {
    await diagnostics.error("groups", "Could not create group.", {
      userId: session.user.id,
      error: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json({ error: "Could not create group right now. Please try again." }, { status: 500 });
  }
}
