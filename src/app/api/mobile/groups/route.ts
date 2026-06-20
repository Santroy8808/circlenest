import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { createGroup, getGroupProfile, safeListGroups } from "@/modules/groups/groups.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const groupId = request.nextUrl.searchParams.get("groupId");
  if (groupId) {
    const result = await getGroupProfile(session.user.id, groupId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ group: result.group });
  }

  return NextResponse.json({
    groups: await safeListGroups({
      viewerUserId: session.user.id,
      mode: request.nextUrl.searchParams.get("mode"),
      query: request.nextUrl.searchParams.get("q")
    })
  });
}

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const result = await createGroup(session.user.id, await request.json().catch(() => ({})));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ group: result.group }, { status: 201 });
}
