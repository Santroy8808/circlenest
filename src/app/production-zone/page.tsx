import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProductionZoneHub } from "@/components/production-zone/production-zone-hub";
import { AppShell } from "@/components/platform/app-shell";
import { getProductionZoneView } from "@/modules/production-zone/production-zone.service";

export default async function ProductionZonePage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/production-zone");
  }

  const zone = await getProductionZoneView(session.user.id);

  return (
    <AppShell>
      <ProductionZoneHub zone={zone} />
    </AppShell>
  );
}
