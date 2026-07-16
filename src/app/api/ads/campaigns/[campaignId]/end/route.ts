import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/platform/roles";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import { endAdCampaign } from "@/modules/ads-credits/ads-credits.service";

export async function POST(_request: Request, { params }: { params: { campaignId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const generalAccess = await canUserAccessFeature(session.user.id, "ads.createGeneral");
  const marketAdAccess = await canUserAccessFeature(session.user.id, "market.createAd");
  if (!isAdminRole(session.user.role) && !generalAccess.allowed && !marketAdAccess.allowed) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const result = await endAdCampaign(session.user.id, params.campaignId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
