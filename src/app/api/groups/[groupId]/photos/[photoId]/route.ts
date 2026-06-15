import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { canModerateGroup } from "@/lib/auth/scoped-moderation";
import { deleteStoredUpload } from "@/lib/security/upload-storage";
import { tryReleaseUserUploadAsset } from "@/lib/media/storage-quota";
import { canManageGroupAssets } from "@/modules/groups/group-assets.service";

export async function PATCH(request: Request, context: { params: { groupId: string; photoId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { albumId?: string | null; caption?: string | null };

  if (body.albumId) {
    const album = await prisma.groupPhotoAlbum.findFirst({
      where: { id: body.albumId, groupId: context.params.groupId },
    });
    if (!album) return NextResponse.json({ error: "Album not found in this group" }, { status: 404 });
  }

  const photo = await prisma.groupPhoto.findFirst({
    where: { id: context.params.photoId, groupId: context.params.groupId },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const canModerate = await canModerateGroup(session.user.id, context.params.groupId);
  const assetPermission = await canManageGroupAssets(session.user.id, context.params.groupId);
  if (!canModerate && photo.uploaderId !== session.user.id && !assetPermission.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.groupPhoto.update({
    where: { id: photo.id },
    data: { albumId: body.albumId ?? null, caption: typeof body.caption === "string" ? body.caption.trim() || null : photo.caption },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: { params: { groupId: string; photoId: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const photo = await prisma.groupPhoto.findFirst({
    where: { id: context.params.photoId, groupId: context.params.groupId },
    select: { id: true, url: true, uploaderId: true },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const canModerate = await canModerateGroup(session.user.id, context.params.groupId);
  if (!canModerate && photo.uploaderId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.groupPhoto.delete({ where: { id: photo.id } });
  await tryReleaseUserUploadAsset(photo.uploaderId, photo.url);
  if (photo.uploaderId !== session.user.id) {
    await deleteStoredUpload(photo.url);
  }
  return NextResponse.json({ ok: true });
}
