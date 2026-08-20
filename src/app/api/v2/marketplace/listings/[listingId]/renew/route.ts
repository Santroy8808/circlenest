import { NextRequest } from "next/server";

import { renewMarketplaceListing } from "@/modules/marketplace/marketplace-listings.service";
import { marketplaceLoginRequired, marketplaceResult, marketplaceSessionUser, requireMarketplaceRollout } from "../../../_shared";

export async function POST(_request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  return marketplaceResult(await renewMarketplaceListing(user.id, (await context.params).listingId));
}
