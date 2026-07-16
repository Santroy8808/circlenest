import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest, rateLimitedResponse } from "@/lib/platform/api-request";
import { consumeRateLimit } from "@/lib/platform/rate-limit";
import {
  addConductDisputeStatement,
  getConductDisputeView,
  selectConductDisputeResolved
} from "@/modules/conduct-reporting/disputes.service";

export async function GET(_request: NextRequest, { params }: { params: { reference: string } }) {
  const session = await auth();
  if (!session?.user || session.user.revoked) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const view = await getConductDisputeView(session.user.id, params.reference);
  return view ? NextResponse.json(view) : NextResponse.json({ error: "Dispute not found." }, { status: 404 });
}

export async function POST(request: NextRequest, { params }: { params: { reference: string } }) {
  const session = await auth();
  if (!session?.user || session.user.revoked) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const rateLimit = await consumeRateLimit({ namespace: "conduct:dispute-action", key: session.user.id, limit: 40, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);
  const body = await readJsonRequest(request, 16 * 1024);
  if (!body.ok) return body.response;
  const value = body.value && typeof body.value === "object" && !Array.isArray(body.value) ? (body.value as Record<string, unknown>) : {};
  const result = value.action === "statement"
    ? await addConductDisputeStatement(session.user.id, params.reference, value.body, value.linkedContentUrl)
    : value.action === "resolved"
      ? await selectConductDisputeResolved(session.user.id, params.reference)
      : { ok: false as const, error: "Unsupported dispute action." };
  return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.error }, { status: 400 });
}
