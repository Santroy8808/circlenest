import { NextRequest, NextResponse } from "next/server";

import { updateMarketplaceListing } from "@/modules/marketplace/marketplace-listings.service";
import { getMarketplaceListingDetail } from "@/modules/marketplace/marketplace-search.service";
import { marketplaceJsonBody, marketplaceLoginRequired, marketplaceResult, marketplaceSessionUser, requireMarketplaceRollout } from "../../_shared";

type Context = { params: Promise<{ listingId: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const [{ listingId }, user] = await Promise.all([context.params, marketplaceSessionUser()]);
  const listing = await getMarketplaceListingDetail(listingId, user?.id);
  return listing ? NextResponse.json({ listing }) : NextResponse.json({ error: "Listing not found." }, { status: 404 });
}

export async function PATCH(request: NextRequest, context: Context) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  const body = await marketplaceJsonBody(request);
  if (!body.ok) return body.response;
  const { listingId } = await context.params;
  return marketplaceResult(await updateMarketplaceListing(user.id, listingId, body.value));
}
