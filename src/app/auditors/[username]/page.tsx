import { notFound } from "next/navigation";
import { AuditorDetail } from "@/components/auditors/auditor-detail";
import { AppShell } from "@/components/platform/app-shell";
import { safeGetAuditorDetail } from "@/modules/auditors/auditors.service";

export default async function AuditorDetailPage(props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const result = await safeGetAuditorDetail(params.username);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <AuditorDetail auditor={result.auditor} />
    </AppShell>
  );
}
