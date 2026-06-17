import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createGalleryPhotoRecords, normalizeGalleryVisibility, resolveGalleryAlbum } from "@/lib/gallery/gallery-upload";
import { canUserStoreBytes, trackUserUploadAsset } from "@/lib/media/storage-quota";
import { buildManagedMediaUrl, deleteStoredUploadByKey, getStoredObjectInfoByKey, getUploadStorageBackend } from "@/lib/security/upload-storage";

type CompleteUploadBody = {
  albumId?: string;
  keys?: string[];
  notifyFriendsAndFamily?: boolean;
  visibility?: "PUBLIC" | "FRIENDS" | "FAMILY" | "FRIENDS_FAMILY" | "GROUPS" | "PRIVATE";
  caption?: string | null;
  tagNames?: string[];
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (getUploadStorageBackend() !== "r2") {
    return NextResponse.json({ error: "Direct upload completion is only available with R2 storage." }, { status: 400 });
  }

  const body = (await request.json()) as CompleteUploadBody;
  const keys = Array.isArray(body.keys)
    ? Array.from(
        new Set(
          body.keys
            .map((key) => String(key).trim())
            .filter(Boolean),
        ),
      )
    : [];

  if (!keys.length) return NextResponse.json({ error: "No uploaded objects provided." }, { status: 400 });

  const album = await resolveGalleryAlbum(session.user.id, body.albumId);
  if (!album) return NextResponse.json({ error: "Album not found." }, { status: 404 });

  const allowedPrefix = `users/${session.user.id}/gallery/albums/`;
  if (keys.some((key) => !key.startsWith(allowedPrefix))) {
    return NextResponse.json({ error: "Upload key is outside your gallery scope." }, { status: 403 });
  }

  const objectInfos = await Promise.all(keys.map((key) => getStoredObjectInfoByKey(key)));
  if (objectInfos.some((info) => !info.exists)) {
    return NextResponse.json({ error: "One or more uploaded files could not be found in storage." }, { status: 404 });
  }

  const totalBytes = objectInfos.reduce((sum, info) => sum + Math.max(0, info.contentLength ?? 0), 0);
  const quota = await canUserStoreBytes(session.user.id, totalBytes);
  if (!quota.ok) {
    await Promise.all(keys.map((key) => deleteStoredUploadByKey(key)));
    const remainingMb = (quota.remainingBytes / (1024 * 1024)).toFixed(2);
    const limitLabel = quota.limitBytes >= Number.MAX_SAFE_INTEGER / 2 ? "unlimited" : `${(quota.limitBytes / (1024 * 1024)).toFixed(0)}MB`;
    return NextResponse.json(
      { error: `Storage limit reached. You have ${remainingMb}MB remaining out of ${limitLabel}.` },
      { status: 413 },
    );
  }

  const urls = keys.map((key) => buildManagedMediaUrl(key));
  const result = await createGalleryPhotoRecords({
    userId: session.user.id,
    albumId: album.id,
    urls,
    notifyFriendsAndFamily: Boolean(body.notifyFriendsAndFamily),
    visibility: normalizeGalleryVisibility(body.visibility),
    caption: body.caption ?? null,
    tagNames: body.tagNames ?? [],
  });

  await Promise.all(
    result.photos.map((photo) => {
      const info = objectInfos[keys.findIndex((key) => buildManagedMediaUrl(key) === photo.url)];
      return trackUserUploadAsset(
        session.user.id,
        photo.url,
        Math.max(0, info?.contentLength ?? 0),
        info?.contentType || "application/octet-stream",
      );
    }),
  );

  return NextResponse.json({
    ok: true,
    album: result.album,
    photos: result.photos,
  });
}
