import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { CreateChapterForm } from "@/components/writers-corner/create-chapter-form";
import { safeGetManuscriptDetail } from "@/modules/writers-corner/writers-corner.service";

export default async function CreateChapterPage({ params }: { params: { manuscriptId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/writers-corner/${params.manuscriptId}/chapters/create`);
  }

  const result = await safeGetManuscriptDetail(session.user.id, params.manuscriptId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <CreateChapterForm manuscript={result.manuscript} />
    </AppShell>
  );
}
