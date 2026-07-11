import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MyMarketListings } from "@/components/market/my-market-listings";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { getMarketCreateState, safeListOwnedMarketListings } from "@/modules/market/market.service";

export default async function MyMarketListingsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/market/my-listings");
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const [listings, createState] = await Promise.all([
    safeListOwnedMarketListings(activeActor.actorUserId),
    getMarketCreateState(activeActor.actorUserId)
  ]);

  return (
    <AppShell>
      <MyMarketListings createState={createState} listings={listings} />
    </AppShell>
  );
}
