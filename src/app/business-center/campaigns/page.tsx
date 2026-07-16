import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BusinessCampaigns } from "@/components/business-storefront/business-campaigns";
import { AppShell } from "@/components/platform/app-shell";
import { getAdsManagerView } from "@/modules/ads-credits/ads-credits.service";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";

export default async function BusinessCenterCampaignsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/business-center/campaigns");
  }

  const adsManager = await getAdsManagerView(session.user.id);

  if (!adsManager.canCreate) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "ads.campaigns",
      label: "Business Center Campaigns",
      requestedPath: "/business-center/campaigns",
      source: "route-gate",
      reason: adsManager.reason
    });

    notFound();
  }

  return (
    <AppShell>
      <BusinessCampaigns adsManager={adsManager} />
    </AppShell>
  );
}
