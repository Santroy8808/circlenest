import { NextRequest } from "next/server";

import { cancelMarketplaceInteraction } from "@/modules/marketplace/marketplace-interactions.service";
import { marketplaceLoginRequired, marketplaceResult, marketplaceSessionUser, requireMarketplaceRollout } from "../../../_shared";

export async function POST(_request: NextRequest, context: { params: Promise<{ interactionId: string }> }) {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  return marketplaceResult(await cancelMarketplaceInteraction(user.id, (await context.params).interactionId));
}
