import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BusinessCenterClient } from "@/components/business-storefront/business-center-client";
import { FeatureUnavailableNotice } from "@/components/feature-availability/feature-unavailable-notice";
import { AppShell } from "@/components/platform/app-shell";
import { logUnavailableFeatureClick } from "@/modules/feature-availability/feature-availability.service";
import { getBusinessCenterView } from "@/modules/business-storefront/business-storefront.service";

export default async function BusinessCenterPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/business-center");
  }

  const businessCenter = await getBusinessCenterView(session.user.id);

  if (!businessCenter.canManage) {
    await logUnavailableFeatureClick({
      actorUserId: session.user.id,
      featureKey: "market.storefront",
      label: "Business Center",
      requestedPath: "/business-center",
      source: "route-gate",
      reason: businessCenter.reason
    });

    return (
      <AppShell>
        <FeatureUnavailableNotice featureLabel="Business Center" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <BusinessCenterClient businessCenter={businessCenter} />
    </AppShell>
  );
}
