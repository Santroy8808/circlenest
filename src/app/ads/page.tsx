import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdsManager } from "@/components/ads-credits/ads-manager";
import { AppShell } from "@/components/platform/app-shell";
import { getAdsManagerView } from "@/modules/ads-credits/ads-credits.service";

export default async function AdsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/ads");
  }

  const adsManager = await getAdsManagerView(session.user.id);

  return (
    <AppShell>
      <AdsManager adsManager={adsManager} />
    </AppShell>
  );
}
