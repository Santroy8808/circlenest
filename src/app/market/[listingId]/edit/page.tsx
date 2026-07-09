import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateMarketListingForm } from "@/components/market/create-market-listing-form";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { getMarketCreateState, safeGetMarketListingDetail } from "@/modules/market/market.service";

export default async function EditMarketListingPage({ params }: { params: { listingId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/market/${params.listingId}/edit`);
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const result = await safeGetMarketListingDetail(activeActor.actorUserId, params.listingId);

  if (!result.ok) {
    notFound();
  }

  if (!result.listing.viewerCanManage) {
    redirect(`/market/${result.listing.slug}`);
  }

  const createState = await getMarketCreateState(activeActor.actorUserId);

  return (
    <AppShell>
      <CreateMarketListingForm
        createState={{ ...createState, viewerCanCreate: true, reason: undefined }}
        initialListing={result.listing}
        mode="edit"
      />
    </AppShell>
  );
}
