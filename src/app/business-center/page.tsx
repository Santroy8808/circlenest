import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BusinessCenterHub } from "@/components/business-storefront/business-center-hub";
import { AppShell } from "@/components/platform/app-shell";
import { getAdsManagerView } from "@/modules/ads-credits/ads-credits.service";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";
import { getBusinessCenterView } from "@/modules/business-storefront/business-storefront.service";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export default async function BusinessCenterPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/business-center");
  }

  const [businessCenter, adsManager, writersAccess] = await Promise.all([
    getBusinessCenterView(session.user.id),
    getAdsManagerView(session.user.id),
    canUserAccessFeature(session.user.id, "writers.access")
  ]);

  if (!businessCenter.canManage) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "market.storefront",
      label: "Business Center",
      requestedPath: "/business-center",
      source: "route-gate",
      reason: businessCenter.reason
    });

    notFound();
  }

  return (
    <AppShell>
      <BusinessCenterHub adsManager={adsManager} businessCenter={businessCenter} canUseWriters={writersAccess.allowed} />
    </AppShell>
  );
}
