import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BusinessCenterClient } from "@/components/business-storefront/business-center-client";
import { FeatureUnavailableNotice } from "@/components/feature-availability/feature-unavailable-notice";
import { AppShell } from "@/components/platform/app-shell";
import { getBusinessCenterView } from "@/modules/business-storefront/business-storefront.service";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";

export default async function BusinessCenterStorefrontPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/business-center/storefront");
  }

  const businessCenter = await getBusinessCenterView(session.user.id);

  if (!businessCenter.canManage) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "market.storefront",
      label: "Business Storefront",
      requestedPath: "/business-center/storefront",
      source: "route-gate",
      reason: businessCenter.reason
    });

    return (
      <AppShell>
        <FeatureUnavailableNotice backHref="/business-center" backLabel="Back to Business Center" featureLabel="Business Storefront" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <BusinessCenterClient businessCenter={businessCenter} />
    </AppShell>
  );
}
