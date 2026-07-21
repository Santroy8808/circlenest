import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import {
  consumeRequestRateLimit,
  rateLimitExceededResponse,
  withRateLimitHeaders
} from "@/lib/platform/request-rate-limit";
import { contributorOfferApiError } from "@/modules/membership-policy/contributor-upgrade.api";
import {
  acceptContributorBetaOffer,
  getContributorUpgradeOfferForUser
} from "@/modules/membership-policy/contributor-upgrade.service";

export const dynamic = "force-dynamic";

function unauthenticatedResponse() {
  return NextResponse.json(
    {
      error: "Login required.",
      code: "AUTHENTICATION_REQUIRED",
      recovery: "Sign in and open Membership again."
    },
    { status: 401, headers: { "cache-control": "no-store" } }
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.revoked) return unauthenticatedResponse();

  const contributorOffer = await getContributorUpgradeOfferForUser(session.user.id);
  if (!contributorOffer) {
    return NextResponse.json(
      {
        error: "No active Contributor offer is assigned to this account.",
        code: "OFFER_NOT_FOUND",
        recovery: "Return to Membership after an administrator grants eligibility."
      },
      { status: 404, headers: { "cache-control": "no-store" } }
    );
  }

  return NextResponse.json(
    { contributorOffer },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.revoked) return unauthenticatedResponse();

  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "membership-contributor-offer-accept",
    identity: session.user.id,
    limit: 10,
    windowMs: 10 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const payload = await readJsonRequest(request, 4 * 1024);
  if (!payload.ok) return withRateLimitHeaders(payload.response, rateLimit);
  const body = payload.value && typeof payload.value === "object"
    ? payload.value as { offerId?: unknown }
    : null;
  const offerId = typeof body?.offerId === "string" ? body.offerId.trim() : "";
  if (!offerId) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          error: "Choose the Contributor offer to accept.",
          code: "INVALID_REQUEST",
          recovery: "Refresh Membership and try the current offer again."
        },
        { status: 400, headers: { "cache-control": "no-store" } }
      ),
      rateLimit
    );
  }

  let result: Awaited<ReturnType<typeof acceptContributorBetaOffer>>;
  try {
    result = await acceptContributorBetaOffer(session.user.id, offerId);
  } catch {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          error: "Contributor membership could not be activated right now.",
          code: "OFFER_UNAVAILABLE",
          recovery: "Wait a moment, refresh Membership, and try again."
        },
        { status: 500, headers: { "cache-control": "no-store", "retry-after": "30" } }
      ),
      rateLimit
    );
  }

  if (!result.ok) {
    const failure = contributorOfferApiError(result.error);
    return withRateLimitHeaders(
      NextResponse.json(
        { error: failure.error, code: failure.code, recovery: failure.recovery },
        { status: failure.status, headers: { "cache-control": "no-store" } }
      ),
      rateLimit
    );
  }

  return withRateLimitHeaders(
    NextResponse.json(
      {
        contributorOffer: result.offer,
        activated: !result.idempotent,
        alreadyActive: result.idempotent,
        monthlyCredits: result.monthlyCredits
      },
      { headers: { "cache-control": "no-store" } }
    ),
    rateLimit
  );
}
