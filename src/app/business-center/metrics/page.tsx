import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BusinessAdMetrics } from "@/components/business-storefront/business-ad-metrics";
import { AppShell } from "@/components/platform/app-shell";
import { getAdsManagerView } from "@/modules/ads-credits/ads-credits.service";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";

export default async function BusinessCenterMetricsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/business-center/metrics");
  }

  const adsManager = await getAdsManagerView(session.user.id);

  if (!adsManager.canCreate) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "ads.metrics",
      label: "Business Center Metrics",
      requestedPath: "/business-center/metrics",
      source: "route-gate",
      reason: adsManager.reason
    });

    notFound();
  }

  return (
    <AppShell>
      <BusinessAdMetrics adsManager={adsManager} />
    </AppShell>
  );
}
