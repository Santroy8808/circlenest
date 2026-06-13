import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/layout/app-shell";
import { WritersStudioProjectDetailClient } from "@/components/writers-studio/writers-studio-project-detail-client";
import { prisma } from "@/lib/db/prisma";
import { serializeWritersStudioProject } from "@/lib/writers-studio/writers-studio";

type PageProps = {
  params: {
    projectId: string;
  };
};

export default async function WritersStudioProjectPage({ params }: PageProps) {
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

  return (
    <AppShell>
      <section className="card p-4">
        <WritersStudioProjectDetailClient project={serialized} isOwner={project.ownerId === session.user.id} />
      </section>
    </AppShell>
  );
}
