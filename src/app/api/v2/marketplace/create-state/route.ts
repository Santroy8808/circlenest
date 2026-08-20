import { NextResponse } from "next/server";

import { getMarketplaceCreateState } from "@/modules/marketplace/marketplace-listings.service";
import { marketplaceLoginRequired, marketplaceSessionUser, requireMarketplaceRollout } from "../_shared";

export async function GET() {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  return NextResponse.json(await getMarketplaceCreateState(user.id));
}
