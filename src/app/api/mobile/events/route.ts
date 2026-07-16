import { NextRequest, NextResponse } from "next/server";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { isAdminRole } from "@/lib/platform/roles";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import { createEvent, safeGetEventDetail, safeListEvents, setEventRsvp } from "@/modules/events/events.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  if (!isAdminRole(session.user.role) && !(await canUserAccessFeature(session.user.id, "events.create")).allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const eventId = request.nextUrl.searchParams.get("eventId");
  if (eventId) {
    const result = await safeGetEventDetail(session.user.id, eventId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json({ event: result.event });
  }

  return NextResponse.json(await safeListEvents(session.user.id));
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  if (!isAdminRole(session.user.role) && !(await canUserAccessFeature(session.user.id, "events.create")).allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const eventId = body.eventId;
  const result = eventId ? await setEventRsvp(session.user.id, eventId, body) : await createEvent(session.user.id, body);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
