import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { MarketplaceDetail } from "@/components/marketplace/marketplace-detail";
import { isMarketplaceListingSaved } from "@/modules/marketplace/marketplace-interactions.service";
import { getMarketplaceListingDetail } from "@/modules/marketplace/marketplace-search.service";

export default async function MarketplaceListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const [session, { slug }] = await Promise.all([auth(), params]);
  const userId = session?.user && !session.user.revoked ? session.user.id : null;
  const listing = await getMarketplaceListingDetail(slug, userId);
  if (!listing) notFound();
  const initialSaved = userId ? await isMarketplaceListingSaved(userId, listing.id) : false;
  return <MarketplaceDetail initialSaved={initialSaved} listing={listing} signedIn={Boolean(userId)} />;
}
