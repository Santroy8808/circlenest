import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MarketDirectoryClient } from "@/components/market/market-directory-client";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { getListingViewPreference } from "@/modules/listing-preferences/listing-preferences.service";
import { getMarketCreateState, safeListMarketListings } from "@/modules/market/market.service";

export default async function MarketPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/market");
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const [listings, createState, initialView] = await Promise.all([
    safeListMarketListings(),
    getMarketCreateState(activeActor.actorUserId),
    getListingViewPreference(session.user.id, "market", "square")
  ]);

  return (
    <AppShell>
      <MarketDirectoryClient createState={createState} initialListings={listings} initialView={initialView} />
    </AppShell>
  );
}
