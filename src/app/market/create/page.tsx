import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateMarketListingForm } from "@/components/market/create-market-listing-form";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { getMarketCreateState } from "@/modules/market/market.service";

export default async function CreateMarketListingPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/market/create");
  }

  const activeActor = await getActiveAccountActor(session.user.id);
  const createState = await getMarketCreateState(activeActor.actorUserId);

  return (
    <AppShell>
      <CreateMarketListingForm createState={createState} />
    </AppShell>
  );
}
