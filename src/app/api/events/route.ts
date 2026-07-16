import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/platform/roles";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import { createEvent, listEvents } from "@/modules/events/events.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  if (!isAdminRole(session.user.role) && !(await canUserAccessFeature(session.user.id, "events.create")).allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const result = await listEvents(session.user.id);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  if (!isAdminRole(session.user.role) && !(await canUserAccessFeature(session.user.id, "events.create")).allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json();
  const result = await createEvent(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ event: result.event }, { status: 201 });
}
