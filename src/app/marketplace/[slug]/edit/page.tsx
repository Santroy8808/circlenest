import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { MarketplaceListingWizard } from "@/components/marketplace/marketplace-listing-wizard";
import { getMarketplaceCreateState } from "@/modules/marketplace/marketplace-listings.service";
import { getMarketplaceListingDetail } from "@/modules/marketplace/marketplace-search.service";
import { MARKETPLACE_TEMPLATES } from "@/modules/marketplace/marketplace-templates";

export default async function EditMarketplaceListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  const { slug } = await params;
  if (!session?.user || session.user.revoked) redirect(`/login?callbackUrl=${encodeURIComponent(`/marketplace/${slug}/edit`)}`);
  const [listing, createState] = await Promise.all([
    getMarketplaceListingDetail(slug, session.user.id),
    getMarketplaceCreateState(session.user.id),
  ]);
  if (!listing || !listing.canManage) notFound();
  return <MarketplaceListingWizard createState={createState} initialListing={listing} templates={MARKETPLACE_TEMPLATES} />;
}
