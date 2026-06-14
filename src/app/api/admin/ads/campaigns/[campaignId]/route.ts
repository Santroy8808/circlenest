import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/admin/admin-api-guards";
import { updateAdCampaignAdminState } from "@/lib/admin/admin-ops";

export async function PATCH(request: Request, { params }: { params: { campaignId: string } }) {
  const gate = await requireAdminApiAccess();
  if (gate.error) return gate.error;

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    manualAdminBoost?: number;
    manualAdminDemotion?: number;
    note?: string;
  };

  const campaign = await updateAdCampaignAdminState({
    actorUserId: gate.userId,
    campaignId: params.campaignId,
    status: body.status,
    manualAdminBoost: typeof body.manualAdminBoost === "number" ? body.manualAdminBoost : null,
    manualAdminDemotion: typeof body.manualAdminDemotion === "number" ? body.manualAdminDemotion : null,
    note: body.note,
  });

  return NextResponse.json({ campaign });
}
