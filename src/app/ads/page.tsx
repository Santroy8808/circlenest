import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdsManager } from "@/components/ads-credits/ads-manager";
import { FeatureUnavailableNotice } from "@/components/feature-availability/feature-unavailable-notice";
import { AppShell } from "@/components/platform/app-shell";
import { getAdsManagerView } from "@/modules/ads-credits/ads-credits.service";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";

export default async function AdsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/ads");
  }

  const adsManager = await getAdsManagerView(session.user.id);

  if (!adsManager.canCreate) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "ads.createGeneral",
      label: "Ad Campaigns",
      requestedPath: "/ads",
      source: "route-gate",
      reason: adsManager.reason
    });

    return (
      <AppShell>
        <FeatureUnavailableNotice featureLabel="Ad Campaigns" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <AdsManager adsManager={adsManager} />
    </AppShell>
  );
}
