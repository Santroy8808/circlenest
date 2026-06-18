import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createAdCampaign } from "@/modules/ads-credits/ads-credits.service";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json();
  const result = await createAdCampaign(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ campaign: result.campaign }, { status: 201 });
}
