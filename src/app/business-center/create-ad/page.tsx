import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateAdCampaignForm } from "@/components/ads-credits/create-ad-campaign-form";
import { AppShell } from "@/components/platform/app-shell";
import { getAdsManagerView } from "@/modules/ads-credits/ads-credits.service";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";

export default async function BusinessCenterCreateAdPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/business-center/create-ad");
  }

  const [businessAccess, adsAccess] = await Promise.all([
    resolveMembershipRouteAccess(session.user.id, "businessManage", "page"),
    resolveMembershipRouteAccess(session.user.id, "businessAdsManage", "page")
  ]);
  const deniedAccess = !businessAccess.allowed ? businessAccess : !adsAccess.allowed ? adsAccess : null;
  if (deniedAccess) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "ads.createGeneral",
      label: "Business Center Create Ad",
      requestedPath: "/business-center/create-ad",
      source: "route-gate",
      reason: deniedAccess.error
    });
    notFound();
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

    notFound();
  }

  return (
    <AppShell>
      <CreateAdCampaignForm adsManager={adsManager} cancelHref="/business-center" successHref="/business-center/campaigns" />
    </AppShell>
  );
}
