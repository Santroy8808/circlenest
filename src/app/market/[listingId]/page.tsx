import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { MarketListingDetail } from "@/components/market/market-listing-detail";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { isAdminRole } from "@/lib/platform/roles";
import { safeGetMarketListingDetail } from "@/modules/market/market.service";

export default async function MarketListingPage({ params }: { params: { listingId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/market/${params.listingId}`);
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const result = await safeGetMarketListingDetail(activeActor.actorUserId, params.listingId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <MarketListingDetail isAdmin={isAdminRole(session.user.role)} listing={result.listing} />
    </AppShell>
  );
}
