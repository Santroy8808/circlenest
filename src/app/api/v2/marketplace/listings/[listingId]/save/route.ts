import { NextRequest } from "next/server";

import { setMarketplaceListingSaved } from "@/modules/marketplace/marketplace-interactions.service";
import { marketplaceJsonBody, marketplaceLoginRequired, marketplaceResult, marketplaceSessionUser, requireMarketplaceRollout } from "../../../_shared";

export async function PUT(request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  const body = await marketplaceJsonBody(request);
  if (!body.ok) return body.response;
  const value = body.value && typeof body.value === "object" ? body.value as Record<string, unknown> : {};
  return marketplaceResult(await setMarketplaceListingSaved(user.id, (await context.params).listingId, value.saved !== false));
}
