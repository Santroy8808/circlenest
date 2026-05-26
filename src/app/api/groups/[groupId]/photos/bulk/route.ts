import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

type BulkBody = {
  photoIds?: string[];
  albumId?: string | null;
  addTags?: string[];
  removeTags?: string[];
};

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export async function PATCH(request: Request, context: { params: { groupId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: context.params.groupId, userId: session.user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Join group first" }, { status: 403 });

  const body = (await request.json()) as BulkBody;
  const ids = (body.photoIds || []).filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: "photoIds required" }, { status: 400 });

  if (body.albumId) {
    const album = await prisma.groupPhotoAlbum.findFirst({ where: { id: body.albumId, groupId: context.params.groupId } });
    if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
  }

  const photos = await prisma.groupPhoto.findMany({
    where: { id: { in: ids }, groupId: context.params.groupId },
    select: { id: true, tags: true },
  });

  for (const p of photos) {
    const currentTags = new Set(parseTags(p.tags));
    for (const t of body.addTags || []) {
      if (t.trim()) currentTags.add(t.trim().toLowerCase());
    }
    for (const t of body.removeTags || []) {
      if (t.trim()) currentTags.delete(t.trim().toLowerCase());
    }

    await prisma.groupPhoto.update({
      where: { id: p.id },
      data: {
        albumId: body.albumId !== undefined ? body.albumId : undefined,
        tags: JSON.stringify(Array.from(currentTags).slice(0, 20)),
      },
    });
  }

  return NextResponse.json({ ok: true, updated: photos.length });
}
