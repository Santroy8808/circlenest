import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import {
  consumeRequestRateLimit,
  rateLimitExceededResponse,
  withRateLimitHeaders
} from "@/lib/platform/request-rate-limit";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import { contributorOfferApiError } from "@/modules/membership-policy/contributor-upgrade.api";
import {
  getContributorUpgradeOfferForAdmin,
  grantContributorBetaOffer,
  revokeContributorBetaOffer
} from "@/modules/membership-policy/contributor-upgrade.service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { userId: string } };

async function requireAdministrator() {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "Login required.",
          code: "AUTHENTICATION_REQUIRED",
          recovery: "Sign in with an administrator account."
        },
        { status: 401, headers: { "cache-control": "no-store" } }
      )
    };
  }
  if (!(await isAdminUser(session.user.id))) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "Admin access required.",
          code: "ADMIN_ACCESS_REQUIRED",
          recovery: "Use an administrator account that can manage membership eligibility."
        },
        { status: 403, headers: { "cache-control": "no-store" } }
      )
    };
  }
  return { ok: true as const, userId: session.user.id };
}

function serviceFailure(error: string) {
  const failure = contributorOfferApiError(error);
  return NextResponse.json(
    { error: failure.error, code: failure.code, recovery: failure.recovery },
    { status: failure.status, headers: { "cache-control": "no-store" } }
  );
}

export async function GET(_request: Request, { params }: RouteContext) {
  const administrator = await requireAdministrator();
  if (!administrator.ok) return administrator.response;

  const result = await getContributorUpgradeOfferForAdmin(administrator.userId, params.userId);
  if (!result.ok) return serviceFailure(result.error);
  return NextResponse.json(
    { contributorOffer: result.contributorOffer },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const administrator = await requireAdministrator();
  if (!administrator.ok) return administrator.response;

  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "admin-contributor-offer-grant",
    identity: administrator.userId,
    limit: 30,
    windowMs: 10 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const payload = await readJsonRequest(request, 8 * 1024);
  if (!payload.ok) return withRateLimitHeaders(payload.response, rateLimit);
  const body = payload.value && typeof payload.value === "object"
    ? payload.value as Record<string, unknown>
    : {};

  let result: Awaited<ReturnType<typeof grantContributorBetaOffer>>;
  try {
    result = await grantContributorBetaOffer(administrator.userId, {
      ...body,
      targetUserId: params.userId
    });
  } catch {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          error: "The Contributor offer could not be saved right now.",
          code: "OFFER_UNAVAILABLE",
          recovery: "Wait a moment and submit the same command again."
        },
        { status: 500, headers: { "cache-control": "no-store", "retry-after": "30" } }
      ),
      rateLimit
    );
  }

  if (!result.ok) {
    return withRateLimitHeaders(
      serviceFailure(result.error ?? "The Contributor offer could not be granted."),
      rateLimit
    );
  }

  return withRateLimitHeaders(
    NextResponse.json(
      {
        contributorOffer: result.offer,
        command: {
          commandId: result.commandId,
          auditLogId: result.auditLogId,
          replayed: result.replayed
        }
      },
      {
        status: result.replayed ? 200 : 201,
        headers: { "cache-control": "no-store" }
      }
    ),
    rateLimit
  );
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const administrator = await requireAdministrator();
  if (!administrator.ok) return administrator.response;

  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "admin-contributor-offer-revoke",
    identity: administrator.userId,
    limit: 30,
    windowMs: 10 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const payload = await readJsonRequest(request, 8 * 1024);
  if (!payload.ok) return withRateLimitHeaders(payload.response, rateLimit);
  const body = payload.value && typeof payload.value === "object"
    ? payload.value as Record<string, unknown>
    : {};

  let result: Awaited<ReturnType<typeof revokeContributorBetaOffer>>;
  try {
    result = await revokeContributorBetaOffer(administrator.userId, {
      ...body,
      targetUserId: params.userId
    });
  } catch {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          error: "The Contributor offer could not be revoked right now.",
          code: "OFFER_UNAVAILABLE",
          recovery: "Wait a moment and submit the same command again."
        },
        { status: 500, headers: { "cache-control": "no-store", "retry-after": "30" } }
      ),
      rateLimit
    );
  }

  if (!result.ok) return withRateLimitHeaders(serviceFailure(result.error), rateLimit);

  return withRateLimitHeaders(
    NextResponse.json(
      {
        revocation: result.revocation,
        command: {
          commandId: result.commandId,
          auditLogId: result.auditLogId,
          replayed: result.replayed
        }
      },
      { headers: { "cache-control": "no-store" } }
    ),
    rateLimit
  );
}
