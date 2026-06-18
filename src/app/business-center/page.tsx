import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BusinessCenterClient } from "@/components/business-storefront/business-center-client";
import { AppShell } from "@/components/platform/app-shell";
import { getBusinessCenterView } from "@/modules/business-storefront/business-storefront.service";

export default async function BusinessCenterPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/business-center");
  }

  const businessCenter = await getBusinessCenterView(session.user.id);

  return (
    <AppShell>
      <BusinessCenterClient businessCenter={businessCenter} />
    </AppShell>
  );
}
