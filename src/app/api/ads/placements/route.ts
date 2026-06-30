import { AdPlacement } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { timeServerStep } from "@/lib/platform/server-timing";
import { getAdPlacementPool } from "@/modules/ads-credits/ads-credits.service";

function parsePlacement(value: string | null) {
  if (value && Object.values(AdPlacement).includes(value as AdPlacement)) {
    return value as AdPlacement;
  }

  return AdPlacement.RIGHT_STREAM;
}

export async function GET(request: NextRequest) {
  const session = await timeServerStep("api.ads.placements.auth", auth());

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const placement = parsePlacement(request.nextUrl.searchParams.get("placement"));
  const ads = await timeServerStep("api.ads.placements.pool", getAdPlacementPool({
    viewerUserId: session.user.id,
    placement,
    limit: 16
  }), { placement });

  return NextResponse.json({ ads });
}
