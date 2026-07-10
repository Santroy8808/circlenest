import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/platform/request-context";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/platform/rate-limit";
import { createAuditorHelpAccount } from "@/modules/auditor-help/auditor-help.service";

export async function POST(request: NextRequest) {
  const context = getRequestContext(request);
  const rateLimit = await consumeRateLimit({
    namespace: "public:gethelp-account",
    key: context.ipAddress ?? "unknown-address",
    limit: 5,
    windowMs: 60 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

  const body = await readJsonRequest(request, 16 * 1024);
  if (!body.ok) return body.response;
  const result = await createAuditorHelpAccount(body.value, context);
  const headers = { ...rateLimitHeaders(rateLimit), "cache-control": "no-store" };

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers });
  }

  return NextResponse.json(
    {
      credentials: result.credentials,
      profileId: result.profileId
    },
    { status: 201, headers }
  );
}
