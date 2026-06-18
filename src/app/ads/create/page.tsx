import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateAdCampaignForm } from "@/components/ads-credits/create-ad-campaign-form";
import { AppShell } from "@/components/platform/app-shell";
import { getAdsManagerView } from "@/modules/ads-credits/ads-credits.service";

export default async function CreateAdPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/ads/create");
  }

  const adsManager = await getAdsManagerView(session.user.id);

  return (
    <AppShell>
      <CreateAdCampaignForm adsManager={adsManager} />
    </AppShell>
  );
}
