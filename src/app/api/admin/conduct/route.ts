import { ConductScanMode } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import {
  approveConductCandidate,
  assignConductCandidate,
  dismissConductCandidate,
  getConductAdminView,
  restrictConductCandidatePair,
  updateConductConfig
} from "@/modules/conduct-reporting/admin.service";
import { overrideConductDisputeResolution } from "@/modules/conduct-reporting/disputes.service";
import { getConductConfig, queueConductScan } from "@/modules/conduct-reporting/scanner.service";
import { isFeatureEnabled } from "@/modules/feature-flags/feature-flags.service";

async function requireAdmin() {
  const session = await auth();
  return session?.user && !session.user.revoked && (await isAdminUser(session.user.id)) ? session.user : null;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  return NextResponse.json(await getConductAdminView());
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const body = await readJsonRequest(request, 128 * 1024);
  if (!body.ok) return body.response;
  const value = body.value && typeof body.value === "object" && !Array.isArray(body.value) ? (body.value as Record<string, unknown>) : {};
  let result: unknown;
  if (value.action === "configure") {
    result = { ok: true, config: await updateConductConfig(user.id, (value.config ?? {}) as never) };
  } else if (value.action === "run") {
    if (!(await isFeatureEnabled("operations.communication_review"))) {
      return NextResponse.json({ error: "Communication Review Scanner is disabled in Feature Controls." }, { status: 400 });
    }
    const config = await getConductConfig();
    if (!config.manualEnabled) return NextResponse.json({ error: "Manual communication review is disabled." }, { status: 400 });
    const start = typeof value.windowStart === "string" ? new Date(value.windowStart) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = typeof value.windowEnd === "string" ? new Date(value.windowEnd) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return NextResponse.json({ error: "Valid review dates are required." }, { status: 400 });
    const run = await queueConductScan({
      mode: value.backfill ? ConductScanMode.BACKFILL : ConductScanMode.MANUAL,
      requestedByUserId: user.id,
      windowStart: start,
      windowEnd: end,
      groupId: typeof value.groupId === "string" ? value.groupId : null,
      dryRun: Boolean(value.dryRun)
    });
    result = { ok: true, runReference: run.reference };
  } else if (value.action === "approve-candidate" && typeof value.reference === "string") {
    result = await approveConductCandidate(user.id, value.reference, value.reason);
  } else if (value.action === "dismiss-candidate" && typeof value.reference === "string") {
    result = await dismissConductCandidate(user.id, value.reference, value.reason);
  } else if (value.action === "assign-candidate" && typeof value.reference === "string") {
    result = await assignConductCandidate(user.id, value.reference, typeof value.moderatorUserId === "string" ? value.moderatorUserId : null);
  } else if (value.action === "restrict-pair" && typeof value.reference === "string" && typeof value.otherUserId === "string") {
    result = await restrictConductCandidatePair({ actorUserId: user.id, candidateReference: value.reference, otherUserId: value.otherUserId, requestedDays: Number(value.requestedDays), reason: typeof value.reason === "string" ? value.reason : "" });
  } else if (value.action === "override-dispute" && typeof value.reference === "string") {
    result = await overrideConductDisputeResolution(user.id, value.reference, value.outcome === "DISMISSED" ? "DISMISSED" : "RESOLVED", value.reason);
  } else {
    return NextResponse.json({ error: "Unsupported communication review action." }, { status: 400 });
  }
  const response = result as { ok?: boolean; error?: string };
  return response.ok === false ? NextResponse.json({ error: response.error ?? "Action failed." }, { status: 400 }) : NextResponse.json(result);
}
