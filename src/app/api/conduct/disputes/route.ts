import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit } from "@/lib/platform/rate-limit";
import { openConductDispute } from "@/modules/conduct-reporting/disputes.service";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.revoked) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const rateLimit = await consumeRateLimit({ namespace: "conduct:open-dispute", key: session.user.id, limit: 10, windowMs: 24 * 60 * 60 * 1000 });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);
  const body = await readJsonRequest(request, 16 * 1024);
  if (!body.ok) return body.response;
  const value = body.value && typeof body.value === "object" && !Array.isArray(body.value) ? (body.value as Record<string, unknown>) : {};
  if (typeof value.reportReference !== "string") return NextResponse.json({ error: "Report reference is required." }, { status: 400 });
  const result = await openConductDispute(session.user.id, value.reportReference, value.statement);
  return result.ok ? NextResponse.json(result, { status: result.existing ? 200 : 201 }) : NextResponse.json({ error: result.error }, { status: 400 });
}
