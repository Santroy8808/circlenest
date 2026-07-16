import { ConductLocationType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit } from "@/lib/platform/rate-limit";
import { getConductFolder, submitManualConductReport } from "@/modules/conduct-reporting/conduct-reporting.service";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.revoked) return NextResponse.json({ error: "Login required." }, { status: 401 });
  return NextResponse.json(await getConductFolder(session.user.id));
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.revoked) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const rateLimit = await consumeRateLimit({ namespace: "conduct:manual-report", key: session.user.id, limit: 20, windowMs: 24 * 60 * 60 * 1000 });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);
  const body = await readJsonRequest(request, 16 * 1024);
  if (!body.ok) return body.response;
  const value = body.value && typeof body.value === "object" && !Array.isArray(body.value) ? (body.value as Record<string, unknown>) : {};
  const locationType = typeof value.locationType === "string" && Object.values(ConductLocationType).includes(value.locationType as ConductLocationType)
    ? (value.locationType as ConductLocationType)
    : null;
  if (!locationType || typeof value.contentId !== "string" || typeof value.reasonCode !== "string") {
    return NextResponse.json({ error: "Location, content, and report reason are required." }, { status: 400 });
  }
  const result = await submitManualConductReport(session.user.id, {
    locationType,
    contentId: value.contentId,
    reasonCode: value.reasonCode,
    context: typeof value.context === "string" ? value.context : null
  });
  return result.ok ? NextResponse.json(result, { status: 201 }) : NextResponse.json({ error: result.error }, { status: 400 });
}
