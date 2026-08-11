import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { AppShell } from "@/components/platform/app-shell";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { loadDashboardWidgetResults, getDashboardSettings } from "@/modules/dashboard/dashboard.service";
import { dashboardVisibleSlots } from "@/modules/dashboard/types";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect("/login?callbackUrl=/dashboard");

  const activeActor = await getActiveAccountActor(session.user.id);
  const settings = await getDashboardSettings(session.user.id);
  const visibleSlots = dashboardVisibleSlots(settings.configuration);
  const widgetResults = await loadDashboardWidgetResults({
    userId: session.user.id,
    actorUserId: activeActor.actorUserId,
    widgets: visibleSlots.map((slot) => slot.widget)
  });

  return (
    <AppShell>
      <DashboardWorkspace
        availableWidgets={settings.availableWidgets}
        configuration={settings.configuration}
        initialWidgetResults={Object.fromEntries(widgetResults)}
      />
    </AppShell>
  );
}
