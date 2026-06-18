import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateMarketListingForm } from "@/components/market/create-market-listing-form";
import { AppShell } from "@/components/platform/app-shell";
import { getMarketCreateState } from "@/modules/market/market.service";

export default async function CreateMarketListingPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/market/create");
  }

  const createState = await getMarketCreateState(session.user.id);

  return (
    <AppShell>
      <CreateMarketListingForm createState={createState} />
    </AppShell>
  );
}
