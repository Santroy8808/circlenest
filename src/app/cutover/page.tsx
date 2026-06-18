import { AppShell } from "@/components/platform/app-shell";
import { CutoverDashboard } from "@/components/cutover-readiness/cutover-dashboard";
import { getCutoverDashboard } from "@/modules/cutover-readiness/cutover-readiness.service";

export default function CutoverPage() {
  return (
    <AppShell>
      <CutoverDashboard dashboard={getCutoverDashboard()} />
    </AppShell>
  );
}
