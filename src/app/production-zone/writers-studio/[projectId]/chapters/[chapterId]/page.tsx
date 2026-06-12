import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { WritersStudioChapterReader } from "@/components/writers-studio/writers-studio-chapter-reader";
import { prisma } from "@/lib/db/prisma";
import { serializeWritersStudioProject } from "@/lib/writers-studio/writers-studio";

type PageProps = {
  params: {
    projectId: string;
    chapterId: string;
  };
};

export default async function WritersStudioChapterPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const project = await prisma.writerStudioProject.findUnique({
    where: { id: params.projectId },
    include: {
      owner: { select: { id: true, username: true, fullName: true } },
      articles: { orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] },
      _count: { select: { articles: true } },
    },
  });

  if (!project || (!project.isPublic && project.ownerId !== session.user.id)) {
    notFound();
  }

  const serialized = serializeWritersStudioProject(project);
  const chapterIndex = serialized.chapters.findIndex((chapter) => chapter.id === params.chapterId);
  if (chapterIndex < 0) notFound();

  const chapter = serialized.chapters[chapterIndex];
  const previousChapterId = serialized.chapters[chapterIndex - 1]?.id ?? null;
  const nextChapterId = serialized.chapters[chapterIndex + 1]?.id ?? null;

  return (
    <AppShell>
      <section className="card p-4">
        <WritersStudioChapterReader
          project={serialized}
          chapter={chapter}
          isOwner={project.ownerId === session.user.id}
          previousChapterId={previousChapterId}
          nextChapterId={nextChapterId}
        />
      </section>
    </AppShell>
  );
}
