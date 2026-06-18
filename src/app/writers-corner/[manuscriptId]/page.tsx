import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { ManuscriptDetail } from "@/components/writers-corner/manuscript-detail";
import { safeGetManuscriptDetail } from "@/modules/writers-corner/writers-corner.service";

export default async function ManuscriptPage({ params }: { params: { manuscriptId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/writers-corner/${params.manuscriptId}`);
  }

  const result = await safeGetManuscriptDetail(session.user.id, params.manuscriptId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <ManuscriptDetail manuscript={result.manuscript} />
    </AppShell>
  );
}
