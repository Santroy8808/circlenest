import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } } });
  if (!membership) return NextResponse.json({ error: "Join group first" }, { status: 403 });

  const body = (await request.json()) as { title?: string; description?: string };
  if (!body.title?.trim()) return NextResponse.json({ error: "Album title required" }, { status: 400 });

  try {
    const album = await prisma.groupPhotoAlbum.create({
      data: {
        groupId: context.params.groupId,
        title: body.title.trim(),
        description: body.description?.trim() || null,
      },
    });
    return NextResponse.json(album);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Album title already exists for this group" }, { status: 409 });
    }
    throw error;
  }
}
