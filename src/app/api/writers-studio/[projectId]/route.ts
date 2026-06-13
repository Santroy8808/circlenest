import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { serializeWritersStudioProject } from "@/lib/writers-studio/writers-studio";

export async function GET(_request: Request, context: { params: { projectId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = context.params;
  const isAdmin = await isAdminUser(session.user.id);
  const project = await prisma.writerStudioProject.findUnique({
    where: { id: projectId },
    include: {
      owner: { select: { id: true, username: true, fullName: true } },
      articles: { orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }] },
      _count: { select: { articles: true } },
    },
  });

  if (!project || (!project.isPublic && project.ownerId !== session.user.id && !isAdmin)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ project: serializeWritersStudioProject(project) });
}
