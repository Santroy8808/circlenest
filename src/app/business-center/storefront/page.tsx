import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BusinessCenterClient } from "@/components/business-storefront/business-center-client";
import { AppShell } from "@/components/platform/app-shell";
import { getBusinessCenterView } from "@/modules/business-storefront/business-storefront.service";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export default async function BusinessCenterStorefrontPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/business-center/storefront");
  }

  const [businessCenter, writersAccess] = await Promise.all([
    getBusinessCenterView(session.user.id),
    canUserAccessFeature(session.user.id, "writers.access")
  ]);

  if (!businessCenter.canManage) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "market.storefront",
      label: "Business Storefront",
      requestedPath: "/business-center/storefront",
      source: "route-gate",
      reason: businessCenter.reason
    });

    notFound();
  }

  return (
    <AppShell>
      <BusinessCenterClient businessCenter={businessCenter} canUseWriters={writersAccess.allowed} />
    </AppShell>
  );
}
