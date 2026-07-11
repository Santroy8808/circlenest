import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MarketDirectoryClient } from "@/components/market/market-directory-client";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { isAdminRole } from "@/lib/platform/roles";
import { getListingViewPreference } from "@/modules/listing-preferences/listing-preferences.service";
import { getMarketCreateState, safeListMarketListings, safeListOwnedMarketListings } from "@/modules/market/market.service";

export default async function MarketPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/market");
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const [listings, myListings, createState, initialView] = await Promise.all([
    safeListMarketListings(),
    safeListOwnedMarketListings(activeActor.actorUserId),
    getMarketCreateState(activeActor.actorUserId),
    getListingViewPreference(session.user.id, "market", "square")
  ]);

  return (
    <AppShell>
      <MarketDirectoryClient
        createState={createState}
        initialListings={listings}
        initialView={initialView}
        isAdmin={isAdminRole(session.user.role)}
        myListings={myListings}
      />
    </AppShell>
  );
}
