import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { getWritersStudioWordCount, sanitizeWritersStudioHtml } from "@/lib/writers-studio/writers-studio";

export async function PATCH(request: Request, context: { params: { projectId: string; chapterId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, chapterId } = context.params;
  const project = await prisma.writerStudioProject.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  });

  if (!project) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (project.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Only the creator can edit chapters." }, { status: 403 });
  }

  const existingChapter = await prisma.writerStudioArticle.findUnique({
    where: { id: chapterId },
    select: { id: true, projectId: true },
  });
  if (!existingChapter || existingChapter.projectId !== projectId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    isPublished?: boolean;
  };

  const title = String(body.title ?? "").trim();
  const content = sanitizeWritersStudioHtml(String(body.body ?? ""));

  const chapter = await prisma.writerStudioArticle.update({
    where: { id: chapterId },
    data: {
      title: title || undefined,
      body: content,
      isPublished: typeof body.isPublished === "boolean" ? body.isPublished : undefined,
    },
    select: {
      id: true,
      title: true,
      body: true,
      orderIndex: true,
      isPublished: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    chapter: {
      ...chapter,
      createdAt: chapter.createdAt.toISOString(),
      updatedAt: chapter.updatedAt.toISOString(),
      wordCount: getWritersStudioWordCount(chapter.body),
    },
  });
}
