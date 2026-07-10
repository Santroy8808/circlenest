import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import { isAdminRole } from "@/lib/platform/roles";
import {
  consumeRequestRateLimit,
  rateLimitExceededResponse,
  withRateLimitHeaders
} from "@/lib/platform/request-rate-limit";
import { revokeUserSessions } from "@/modules/auth-security/auth-security.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "auth-session-revoke",
    identity: session.user.id,
    limit: 30,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const payload = await readJsonRequest(request, 4 * 1024);
  if (!payload.ok) return withRateLimitHeaders(payload.response, rateLimit);
  const body =
    payload.value && typeof payload.value === "object"
      ? payload.value as { targetUserId?: string; reason?: string }
      : null;

  if (!body?.targetUserId) {
    return withRateLimitHeaders(
      NextResponse.json({ error: "targetUserId is required." }, { status: 400 }),
      rateLimit
    );
  }

  const result = await revokeUserSessions({
    actorUserId: session.user.id,
    targetUserId: body.targetUserId,
    reason: body.reason
  });

  return withRateLimitHeaders(
    NextResponse.json(result, { headers: { "cache-control": "no-store" } }),
    rateLimit
  );
}
