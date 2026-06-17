import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveGalleryAlbum } from "@/lib/gallery/gallery-upload";
import { canUserStoreBytes } from "@/lib/media/storage-quota";
import { createDirectUploadTarget, getUploadStorageBackend } from "@/lib/security/upload-storage";

type InitUploadBody = {
  albumId?: string;
  files?: Array<{
    name?: string;
    mimeType?: string;
    sizeBytes?: number;
  }>;
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as InitUploadBody;
  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) return NextResponse.json({ error: "No files provided." }, { status: 400 });

  const album = await resolveGalleryAlbum(session.user.id, body.albumId);
  if (!album) return NextResponse.json({ error: "Album not found." }, { status: 404 });

  const normalizedFiles = files
    .map((file) => ({
      name: String(file.name ?? "").trim(),
      mimeType: String(file.mimeType ?? "").trim() || "application/octet-stream",
      sizeBytes: Math.max(0, Math.floor(Number(file.sizeBytes ?? 0))),
    }))
    .filter((file) => file.name && file.sizeBytes > 0);

  if (!normalizedFiles.length) {
    return NextResponse.json({ error: "No valid files provided." }, { status: 400 });
  }

  const plannedBytes = normalizedFiles.reduce((sum, file) => sum + file.sizeBytes, 0);
  const quota = await canUserStoreBytes(session.user.id, plannedBytes);
  if (!quota.ok) {
    const remainingMb = (quota.remainingBytes / (1024 * 1024)).toFixed(2);
    const limitLabel = quota.limitBytes >= Number.MAX_SAFE_INTEGER / 2 ? "unlimited" : `${(quota.limitBytes / (1024 * 1024)).toFixed(0)}MB`;
    return NextResponse.json(
      { error: `Storage limit reached. You have ${remainingMb}MB remaining out of ${limitLabel}.` },
      { status: 413 },
    );
  }

  if (getUploadStorageBackend() !== "r2") {
    return NextResponse.json({
      backend: "local" as const,
      album,
    });
  }

  const uploads = await Promise.all(
    normalizedFiles.map((file) =>
      createDirectUploadTarget(
        { name: file.name, type: file.mimeType },
        {
          ownerType: "user",
          ownerId: session.user.id,
          uploaderId: session.user.id,
          purpose: "gallery-photo",
          albumId: album.id,
        },
      ),
    ),
  );

  return NextResponse.json({
    backend: "r2" as const,
    album,
    uploads,
  });
}
