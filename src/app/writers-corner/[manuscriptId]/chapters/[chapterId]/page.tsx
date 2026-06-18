import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { ChapterReaderEditor } from "@/components/writers-corner/chapter-reader-editor";
import { safeGetChapterDetail } from "@/modules/writers-corner/writers-corner.service";

export default async function ChapterPage({ params }: { params: { manuscriptId: string; chapterId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/writers-corner/${params.manuscriptId}/chapters/${params.chapterId}`);
  }

  const result = await safeGetChapterDetail(session.user.id, params.chapterId);

  if (!result.ok) {
    notFound();
  }

  return (
    <AppShell>
      <ChapterReaderEditor chapter={result.chapter} />
    </AppShell>
  );
}
