import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { getWritersStudioWordCount, sanitizeWritersStudioHtml } from "@/lib/writers-studio/writers-studio";

export async function POST(request: Request, context: { params: { projectId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = context.params;
  const project = await prisma.writerStudioProject.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true, isPublic: true },
  });

  if (!project) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (project.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Only the creator can add chapters." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    isPublished?: boolean;
  };

  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Chapter title is required." }, { status: 400 });

  const content = sanitizeWritersStudioHtml(String(body.body ?? ""));
  const orderIndex = await prisma.writerStudioArticle.count({ where: { projectId } });

  const article = await prisma.writerStudioArticle.create({
    data: {
      projectId,
      title,
      body: content,
      orderIndex,
      isPublished: body.isPublished ?? true,
    },
  });

  return NextResponse.json({
    ok: true,
    chapter: {
      id: article.id,
      title: article.title,
      body: article.body,
      orderIndex: article.orderIndex,
      isPublished: article.isPublished,
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
      wordCount: getWritersStudioWordCount(article.body),
    },
    projectId,
  });
}
