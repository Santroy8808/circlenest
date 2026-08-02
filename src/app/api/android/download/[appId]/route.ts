import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getAndroidDownload, isAndroidDownloadId } from "@/modules/android-downloads/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailableResponse() {
  return Response.json({ error: "This Android build is not available right now." }, { status: 404 });
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

export async function GET(_request: Request, props: { params: Promise<{ appId: string }> }) {
  const { appId } = await props.params;
  const resolved = await resolveDownload(appId);
  if (!resolved) return unavailableResponse();

  const stream = Readable.toWeb(createReadStream(resolved.download.sourcePath));
  return new Response(stream as ReadableStream, {
    headers: downloadHeaders(resolved.download.downloadName, resolved.file.size)
  });
}

export async function HEAD(_request: Request, props: { params: Promise<{ appId: string }> }) {
  const { appId } = await props.params;
  const resolved = await resolveDownload(appId);
  if (!resolved) return unavailableResponse();

  return new Response(null, {
    headers: downloadHeaders(resolved.download.downloadName, resolved.file.size)
  });
}
