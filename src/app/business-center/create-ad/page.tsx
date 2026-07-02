import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateAdCampaignForm } from "@/components/ads-credits/create-ad-campaign-form";
import { FeatureUnavailableNotice } from "@/components/feature-availability/feature-unavailable-notice";
import { AppShell } from "@/components/platform/app-shell";
import { getAdsManagerView } from "@/modules/ads-credits/ads-credits.service";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";

export default async function BusinessCenterCreateAdPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/business-center/create-ad");
  }

  const adsManager = await getAdsManagerView(session.user.id);

  if (!adsManager.canCreate) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "ads.createGeneral",
      label: "Business Center Create Ad",
      requestedPath: "/business-center/create-ad",
      source: "route-gate",
      reason: adsManager.reason
    });

    return (
      <AppShell>
        <FeatureUnavailableNotice backHref="/business-center" backLabel="Back to Business Center" featureLabel="Create Ad" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <CreateAdCampaignForm adsManager={adsManager} cancelHref="/business-center" successHref="/business-center/campaigns" />
    </AppShell>
  );
}
