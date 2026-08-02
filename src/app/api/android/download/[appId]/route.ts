import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { auth } from "@/auth";
import { getAndroidDownload, isAndroidDownloadId } from "@/modules/android-downloads/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailableResponse() {
  return Response.json({ error: "This Android build is not available right now." }, { status: 404 });
}

async function authorizeAndroidDownload(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.revoked) return Response.json({ error: "Member login required." }, { status: 401 });
  if (!/android/i.test(request.headers.get("user-agent") ?? "")) {
    return Response.json({ error: "Open theta-space.net/android on your Android phone or tablet to download this app." }, { status: 400 });
  }
  return null;
}

async function resolveDownload(appId: string) {
  if (!isAndroidDownloadId(appId)) return null;

  const download = getAndroidDownload(appId);
  try {
    const file = await stat(download.sourcePath);
    if (!file.isFile()) return null;
    return { download, file };
  } catch {
    return null;
  }
}

function downloadHeaders(downloadName: string, size: number) {
  return {
    "Cache-Control": "public, max-age=300",
    "Content-Disposition": `attachment; filename="${downloadName}"`,
    "Content-Length": String(size),
    "Content-Type": "application/vnd.android.package-archive",
    "X-Content-Type-Options": "nosniff"
  };
}

export async function GET(request: Request, props: { params: Promise<{ appId: string }> }) {
  const unauthorized = await authorizeAndroidDownload(request);
  if (unauthorized) return unauthorized;
  const { appId } = await props.params;
  const resolved = await resolveDownload(appId);
  if (!resolved) return unavailableResponse();

  const stream = Readable.toWeb(createReadStream(resolved.download.sourcePath));
  return new Response(stream as ReadableStream, {
    headers: downloadHeaders(resolved.download.downloadName, resolved.file.size)
  });
}

export async function HEAD(request: Request, props: { params: Promise<{ appId: string }> }) {
  const unauthorized = await authorizeAndroidDownload(request);
  if (unauthorized) return unauthorized;
  const { appId } = await props.params;
  const resolved = await resolveDownload(appId);
  if (!resolved) return unavailableResponse();

  return new Response(null, {
    headers: downloadHeaders(resolved.download.downloadName, resolved.file.size)
  });
}
