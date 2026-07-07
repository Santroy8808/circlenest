import { notFound } from "next/navigation";
import { AuditorDetail } from "@/components/auditors/auditor-detail";
import { AppShell } from "@/components/platform/app-shell";
import { safeGetAuditorDetail } from "@/modules/auditors/auditors.service";

export default async function AuditorDetailPage({ params }: { params: { username: string } }) {
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
