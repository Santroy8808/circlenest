import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { MarketplaceSavedWorkspace } from "@/components/marketplace/marketplace-saved-workspace";
import { listSavedMarketplaceListings } from "@/modules/marketplace/marketplace-interactions.service";
import { listMarketplaceSavedSearches } from "@/modules/marketplace/marketplace-saved-search.service";

export default async function SavedMarketplacePage() {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/marketplace/saved");
  const [listings, searches] = await Promise.all([
    listSavedMarketplaceListings(session.user.id),
    listMarketplaceSavedSearches(session.user.id),
  ]);
  if (!listings.ok || !searches.ok) return <MarketplaceSavedWorkspace initialListings={[]} initialSearches={[]} />;
  return <MarketplaceSavedWorkspace
    initialListings={listings.items}
    initialSearches={searches.savedSearches.map((saved) => ({
      id: saved.id,
      name: saved.name,
      query: saved.query as Record<string, unknown>,
      frequency: saved.frequency,
      enabled: saved.enabled,
      lastRunAt: saved.lastRunAt?.toISOString() ?? null,
    }))}
  />;
}
