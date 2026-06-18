import { auth } from "@/auth";
import { MarketDirectoryClient } from "@/components/market/market-directory-client";
import { AppShell } from "@/components/platform/app-shell";
import { getMarketCreateState, safeListMarketListings } from "@/modules/market/market.service";

export default async function MarketPage() {
  const session = await auth();
  const [listings, createState] = await Promise.all([
    safeListMarketListings(),
    session?.user && !session.user.revoked
      ? getMarketCreateState(session.user.id)
      : Promise.resolve({
          viewerCanCreate: false,
          reason: "Log in with a creator tier to create Market listings.",
          listingsRemaining: 0,
          listingLimit: 0,
          photoCap: 0,
          storefrontEligible: false
        })
  ]);

  return (
    <AppShell>
      <MarketDirectoryClient createState={createState} initialListings={listings} />
    </AppShell>
  );
}
