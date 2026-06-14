import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin/admin-api-guards";
import { resolveContentReport } from "@/lib/admin/admin-ops";

export async function PATCH(request: Request, { params }: { params: { reportId: string } }) {
  const gate = await requireAdminApiAccess();
  if (gate.error) return gate.error;

  const body = (await request.json().catch(() => ({}))) as { status?: string; resolution?: string; assignToSelf?: boolean };
  const status = String(body.status ?? "").trim().toUpperCase();
  if (!status) return NextResponse.json({ error: "Status is required." }, { status: 400 });

  const report = await resolveContentReport({
    actorUserId: gate.userId,
    reportId: params.reportId,
    status,
    resolution: body.resolution,
    assignToSelf: Boolean(body.assignToSelf),
  });

  return NextResponse.json({ report });
}
