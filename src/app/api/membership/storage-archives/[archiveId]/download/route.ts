import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { getR2Object } from "@/lib/platform/r2";
import { getStorageArchiveDownloadForUser } from "@/modules/membership-policy/membership-storage-archive.service";

function toWebStream(body: unknown) {
  const transformer = body as { transformToWebStream?: () => ReadableStream };
  if (typeof transformer?.transformToWebStream === "function") return transformer.transformToWebStream();
  return Readable.toWeb(body as Readable);
}

export async function GET(_request: NextRequest, props: { params: Promise<{ archiveId: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.revoked) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const userId = (await getActiveAccountActor(session.user.id)).actorUserId;
  const { archiveId } = await props.params;
  const archive = await getStorageArchiveDownloadForUser(userId, archiveId);
  if (!archive?.downloadStorageKey) return NextResponse.json({ error: "This download is unavailable or has expired." }, { status: 404 });
  try {
    const object = await getR2Object(archive.downloadStorageKey, "private");
    if (!object.Body) throw new Error("Archive download is empty.");
    return new NextResponse(toWebStream(object.Body) as BodyInit, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="theta-space-archived-media-${archiveId}.zip"`,
        "Content-Type": "application/zip",
        "X-Content-Type-Options": "nosniff",
        ...(archive.downloadSizeBytes ? { "Content-Length": archive.downloadSizeBytes.toString() } : {})
      }
    });
  } catch {
    return NextResponse.json({ error: "The ZIP file could not be loaded. Request a new download." }, { status: 410 });
  }
}
