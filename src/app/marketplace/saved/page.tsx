import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { listSavedMarketplaceListings } from "@/modules/marketplace/marketplace-interactions.service";
import { listMarketplaceSavedSearches } from "@/modules/marketplace/marketplace-saved-search.service";

export default async function SavedMarketplacePage() {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/marketplace/saved");
  const [listings, searches] = await Promise.all([
    listSavedMarketplaceListings(session.user.id),
    listMarketplaceSavedSearches(session.user.id),
  ]);
  return <section><h1>Saved marketplace</h1><pre>{JSON.stringify({ listings, searches }, null, 2)}</pre></section>;
}
