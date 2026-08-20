import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { MarketplaceListingWizard } from "@/components/marketplace/marketplace-listing-wizard";
import { getMarketplaceCreateState } from "@/modules/marketplace/marketplace-listings.service";
import { MARKETPLACE_TEMPLATES } from "@/modules/marketplace/marketplace-templates";

export default async function NewMarketplaceListingPage({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/marketplace/new");
  const [createState, params] = await Promise.all([getMarketplaceCreateState(session.user.id), searchParams]);
  return <MarketplaceListingWizard createState={createState} initialIntent={params.intent === "WANTED" ? "WANTED" : "OFFER"} templates={MARKETPLACE_TEMPLATES} />;
}
