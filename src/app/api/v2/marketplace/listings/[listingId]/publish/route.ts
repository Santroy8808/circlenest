import { NextRequest } from "next/server";

import { publishMarketplaceListing } from "@/modules/marketplace/marketplace-listings.service";
import { marketplaceLoginRequired, marketplaceResult, marketplaceSessionUser, requireMarketplaceRollout } from "../../../_shared";

export async function POST(_request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  return marketplaceResult(await publishMarketplaceListing(user.id, (await context.params).listingId));
}
