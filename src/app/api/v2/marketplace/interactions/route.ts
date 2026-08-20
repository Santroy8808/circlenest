import { listMarketplaceInteractions } from "@/modules/marketplace/marketplace-interactions.service";
import { marketplaceLoginRequired, marketplaceResult, marketplaceSessionUser, requireMarketplaceRollout } from "../_shared";

export async function GET() {
  const unavailable = await requireMarketplaceRollout();
  if (unavailable) return unavailable;
  const user = await marketplaceSessionUser();
  if (!user) return marketplaceLoginRequired();
  return marketplaceResult(await listMarketplaceInteractions(user.id));
}
