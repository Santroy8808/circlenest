import { MarketplaceListingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { setMarketplaceListingStatus } from "@/modules/marketplace/marketplace-listings.service";
import { marketplaceJsonBody, marketplaceLoginRequired, marketplaceResult, marketplaceSessionUser, requireMarketplaceRollout } from "../../../_shared";

export async function POST(request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  const body = await marketplaceJsonBody(request);
  if (!body.ok) return body.response;
  const value = body.value && typeof body.value === "object" ? body.value as Record<string, unknown> : {};
  if (typeof value.status !== "string" || !Object.values(MarketplaceListingStatus).includes(value.status as MarketplaceListingStatus)) {
    return NextResponse.json({ error: "Choose a valid listing status." }, { status: 400 });
  }
  return marketplaceResult(await setMarketplaceListingStatus(user.id, (await context.params).listingId, value.status as MarketplaceListingStatus, typeof value.reason === "string" ? value.reason : undefined));
}
