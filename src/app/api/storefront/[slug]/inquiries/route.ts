import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/platform/rate-limit";
import { getRequestContext } from "@/lib/platform/request-context";
import { createBusinessInquiry } from "@/modules/business-storefront/business-storefront.service";

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const context = getRequestContext(request);
  const rateLimit = await consumeRateLimit({
    namespace: "public:storefront-inquiry",
    key: `${context.ipAddress ?? "unknown-address"}:${params.slug}`,
    limit: 15,
    windowMs: 60 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

  const body = await readJsonRequest(request, 24 * 1024);
  if (!body.ok) return body.response;
  const result = await createBusinessInquiry(params.slug, body.value);
  const headers = { ...rateLimitHeaders(rateLimit), "cache-control": "no-store" };

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400, headers });
  }

  return NextResponse.json({ inquiry: result.inquiry }, { status: 201, headers });
}
