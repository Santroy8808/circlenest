import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { endAdCampaign } from "@/modules/ads-credits/ads-credits.service";

export async function POST(_request: Request, { params }: { params: { campaignId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await endAdCampaign(session.user.id, params.campaignId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
