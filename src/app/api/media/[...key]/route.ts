import { readStoredUpload } from "@/lib/security/upload-storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: { key: string[] } }) {
  const key = context.params.key.map((segment) => encodeURIComponent(segment)).join("/");
  const url = `/api/media/${key}`;
  const object = await readStoredUpload(url);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", object.contentType || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (object.contentLength !== undefined) headers.set("Content-Length", String(object.contentLength));
  if (object.etag) headers.set("ETag", object.etag);
  if (object.lastModified) headers.set("Last-Modified", object.lastModified.toUTCString());

  return new Response(object.body, { status: 200, headers });
}
