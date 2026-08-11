import type { DashboardWidgetResult } from "@/modules/dashboard/dashboard.service";
import { dashboardVisibleSlots, type DashboardConfiguration, type DashboardWidgetKey } from "@/modules/dashboard/types";

export function DashboardWorkspace({
  availableWidgets,
  configuration,
  initialWidgetResults
}: {
  availableWidgets: DashboardWidgetKey[];
  configuration: DashboardConfiguration;
  initialWidgetResults: Record<string, DashboardWidgetResult>;
}) {
  return (
    <section aria-label="Dashboard" data-dashboard-layout={configuration.layout}>
      <header>
        <p>Theta-Space</p>
        <h1>Dashboard</h1>
        <p>Keep up with the parts of Theta-Space that matter most to you.</p>
      </header>
      <div>
        {dashboardVisibleSlots(configuration).map((slot) => {
          const result = initialWidgetResults[slot.widget];
          return (
            <article data-dashboard-slot={slot.id} data-widget={slot.widget} key={slot.id}>
              <h2>{slot.widget}</h2>
              <p>{result?.status === "error" ? "This dashboard item is unavailable right now." : "Loading dashboard item."}</p>
            </article>
          );
        })}
      </div>
      <p className="sr-only">{availableWidgets.length} dashboard widgets are available.</p>
    </section>
  );
}
