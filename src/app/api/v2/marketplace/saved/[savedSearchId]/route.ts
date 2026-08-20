import { NextRequest } from "next/server";

import { deleteMarketplaceSavedSearch, updateMarketplaceSavedSearch } from "@/modules/marketplace/marketplace-saved-search.service";
import { marketplaceJsonBody, marketplaceLoginRequired, marketplaceResult, marketplaceSessionUser, requireMarketplaceRollout } from "../../_shared";

type Context = { params: Promise<{ savedSearchId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  const body = await marketplaceJsonBody(request);
  if (!body.ok) return body.response;
  return marketplaceResult(await updateMarketplaceSavedSearch(user.id, (await context.params).savedSearchId, body.value));
}

export async function DELETE(_request: NextRequest, context: Context) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  return marketplaceResult(await deleteMarketplaceSavedSearch(user.id, (await context.params).savedSearchId));
}
