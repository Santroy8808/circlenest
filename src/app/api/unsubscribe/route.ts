import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumeRequestRateLimit, rateLimitExceededResponse, withRateLimitHeaders } from "@/lib/platform/request-rate-limit";
import { readJsonRequest } from "@/lib/platform/api-request";
import { unsubscribeOptionalSystemEmailByToken } from "@/modules/system-email-preferences/system-email-preferences.service";

const unsubscribeSchema = z.object({
  token: z.string().min(20)
});

function redirectWithStatus(request: NextRequest, status: "success" | "invalid", token?: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/unsubscribe";
  url.search = "";
  url.searchParams.set("status", status);
  if (token) url.searchParams.set("token", token);
  return NextResponse.redirect(url, { status: 303, headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const rateLimit = await consumeRequestRateLimit(request, {
    namespace: "system-email-unsubscribe",
    limit: 8,
    windowMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  let token: string | undefined;

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    const payload = await readJsonRequest(request, 8 * 1024);
    if (!payload.ok) return withRateLimitHeaders(payload.response, rateLimit);
    const parsed = unsubscribeSchema.safeParse(payload.value);
    if (!parsed.success) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Unsubscribe token is missing or invalid." },
          { status: 400, headers: { "cache-control": "no-store" } }
        ),
        rateLimit
      );
    }
    token = parsed.data.token;
  } else {
    const formData = await request.formData();
    const parsed = unsubscribeSchema.safeParse({
      token: typeof formData.get("token") === "string" ? formData.get("token") : undefined
    });
    if (!parsed.success) return withRateLimitHeaders(redirectWithStatus(request, "invalid"), rateLimit);
    token = parsed.data.token;
  }

  const result = await unsubscribeOptionalSystemEmailByToken(token);
  if (!result) {
    if (contentType.includes("application/json") || contentType.includes("+json")) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "This unsubscribe link is invalid or has expired." },
          { status: 400, headers: { "cache-control": "no-store" } }
        ),
        rateLimit
      );
    }
    return withRateLimitHeaders(redirectWithStatus(request, "invalid"), rateLimit);
  }

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: true, email: result.email },
        { status: 200, headers: { "cache-control": "no-store" } }
      ),
      rateLimit
    );
  }

  return withRateLimitHeaders(redirectWithStatus(request, "success", token), rateLimit);
}
