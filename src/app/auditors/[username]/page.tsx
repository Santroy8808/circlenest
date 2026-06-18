import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuditorDetail } from "@/components/auditors/auditor-detail";
import { AppShell } from "@/components/platform/app-shell";
import { safeGetAuditorDetail } from "@/modules/auditors/auditors.service";

export default async function AuditorDetailPage({ params }: { params: { username: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/auditors/${params.username}`);
  }

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
