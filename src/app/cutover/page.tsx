import { AppShell } from "@/components/platform/app-shell";
import { CutoverDashboard } from "@/components/cutover-readiness/cutover-dashboard";
import { getCutoverDashboard } from "@/modules/cutover-readiness/cutover-readiness.service";
import { requireAdminPage } from "@/lib/platform/page-access";

export default async function CutoverPage() {
  await requireAdminPage("/cutover");

  return (
    <AppShell>
      <CutoverDashboard dashboard={getCutoverDashboard()} />
    </AppShell>
  );
}
