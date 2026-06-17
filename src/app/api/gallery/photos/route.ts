import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createGalleryPhotoRecords } from "@/lib/gallery/gallery-upload";

type UploadPhotoBody = {
  albumId?: string;
  caption?: string;
  tagNames?: string[];
  urls?: string[];
  notifyFriendsAndFamily?: boolean;
  visibility?: "PUBLIC" | "FRIENDS" | "FAMILY" | "FRIENDS_FAMILY" | "GROUPS" | "PRIVATE";
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as UploadPhotoBody;
  const urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === "string" && u.length > 0) : [];
  if (!urls.length) return NextResponse.json({ error: "No photos provided" }, { status: 400 });

  const result = await createGalleryPhotoRecords({
    userId: session.user.id,
    albumId: body.albumId,
    urls,
    notifyFriendsAndFamily: body.notifyFriendsAndFamily,
    visibility: body.visibility,
    caption: body.caption ?? null,
    tagNames: body.tagNames ?? [],
  });

  if (!result.album) return NextResponse.json({ error: "Album not found" }, { status: 404 });
  return NextResponse.json({ ok: true, album: result.album, photos: result.photos });
}
