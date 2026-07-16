import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/platform/rate-limit";
import { getRequestContext } from "@/lib/platform/request-context";
import { isAdminRole } from "@/lib/platform/roles";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import { submitExternalEventRsvp } from "@/modules/events/events.service";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  if (!isAdminRole(session.user.role) && !(await canUserAccessFeature(session.user.id, "events.create")).allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const context = getRequestContext(request);
  const rateLimit = await consumeRateLimit({
    namespace: "public:event-rsvp",
    key: `${session.user.id}:${context.ipAddress ?? "unknown-address"}:${params.eventId}`,
    limit: 20,
    windowMs: 60 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

  const body = await readJsonRequest(request, 16 * 1024);
  if (!body.ok) return body.response;
  const result = await submitExternalEventRsvp(session.user.id, params.eventId, body.value);
  const headers = { ...rateLimitHeaders(rateLimit), "cache-control": "no-store" };

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers });
  }

  return NextResponse.json(
    { created: result.created, rsvp: result.rsvp },
    { status: result.created ? 201 : 200, headers }
  );
}
