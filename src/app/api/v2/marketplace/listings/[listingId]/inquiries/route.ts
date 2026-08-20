import { NextRequest } from "next/server";

import { createMarketplaceInquiry } from "@/modules/marketplace/marketplace-interactions.service";
import { marketplaceJsonBody, marketplaceLoginRequired, marketplaceResult, marketplaceSessionUser, requireMarketplaceRollout } from "../../../_shared";

export async function POST(request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  const body = await marketplaceJsonBody(request);
  if (!body.ok) return body.response;
  return marketplaceResult(await createMarketplaceInquiry(user.id, (await context.params).listingId, body.value), 201);
}
