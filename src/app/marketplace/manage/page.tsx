import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { MarketplaceManager } from "@/components/marketplace/marketplace-manager";
import { listOwnedMarketplaceListings } from "@/modules/marketplace/marketplace-search.service";

export default async function ManageMarketplaceListingsPage() {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/marketplace/manage");
  const listings = await listOwnedMarketplaceListings(session.user.id);
  return <MarketplaceManager initialListings={listings} />;
}
