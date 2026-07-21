import { MembershipTier } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import {
  consumeRequestRateLimit,
  rateLimitExceededResponse,
  withRateLimitHeaders
} from "@/lib/platform/request-rate-limit";
import { getGodTierPolicyEditorView, setGlobalTierFeatureOverride } from "@/modules/membership-policy/membership-policy.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const view = await getGodTierPolicyEditorView(session.user.id);

  if (!view.canManage) {
    return NextResponse.json({ error: "God access required." }, { status: 403 });
  }

  return NextResponse.json(view);
}

export async function PATCH(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "admin:tier-policy:reauthentication",
    identity: session.user.id,
    limit: 5,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const parsedBody = await readJsonRequest(request);
  if (!parsedBody.ok) return withRateLimitHeaders(parsedBody.response, rateLimit);
  const body = parsedBody.value as Record<string, unknown>;
  const tier = typeof body?.tier === "string" && body.tier in MembershipTier ? (body.tier as MembershipTier) : null;
  const featureKey = typeof body?.featureKey === "string" ? body.featureKey : "";
  const allowed = typeof body?.allowed === "boolean" ? body.allowed : null;
  const password = typeof body?.password === "string" ? body.password : "";
  const reason = typeof body?.reason === "string" ? body.reason : undefined;
  const commandId = typeof body?.commandId === "string" ? body.commandId.trim() : "";

  if (!tier || allowed === null || !featureKey || !password || !commandId) {
    return withRateLimitHeaders(
      NextResponse.json(
        { error: "Command id, tier, feature, target state, and password are required." },
        { status: 400 }
      ),
      rateLimit
    );
  }

  const result = await setGlobalTierFeatureOverride({
    actorUserId: session.user.id,
    commandId,
    tier,
    featureKey,
    allowed,
    password,
    reason
  });

  if (!result.ok) {
    const status = result.error.includes("already been used") ? 409
      : result.error.includes("God access") || result.error.includes("Password") ? 403
      : result.error.includes("disabled") ? 422
      : 400;
    return withRateLimitHeaders(NextResponse.json({ error: result.error }, { status }), rateLimit);
  }

  return withRateLimitHeaders(
    NextResponse.json({ ok: true, commandId, override: result.override, replayed: result.replayed }),
    rateLimit
  );
}
