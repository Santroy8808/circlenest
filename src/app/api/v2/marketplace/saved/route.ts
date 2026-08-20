import { NextRequest } from "next/server";

import { listSavedMarketplaceListings } from "@/modules/marketplace/marketplace-interactions.service";
import { createMarketplaceSavedSearch, listMarketplaceSavedSearches } from "@/modules/marketplace/marketplace-saved-search.service";
import { marketplaceJsonBody, marketplaceLoginRequired, marketplaceResult, marketplaceSessionUser, requireMarketplaceRollout } from "../_shared";

export async function GET(request: NextRequest) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  return request.nextUrl.searchParams.get("type") === "listings"
    ? marketplaceResult(await listSavedMarketplaceListings(user.id))
    : marketplaceResult(await listMarketplaceSavedSearches(user.id));
}

export async function POST(request: NextRequest) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  const body = await marketplaceJsonBody(request);
  if (!body.ok) return body.response;
  return marketplaceResult(await createMarketplaceSavedSearch(user.id, body.value), 201);
}
