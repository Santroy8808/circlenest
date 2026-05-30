import { NextResponse } from "next/server";
import { readStoredUpload } from "@/lib/security/upload-storage";

type RouteContext = {
  params: {
    key?: string[];
  };
};

export async function GET(_request: Request, context: RouteContext) {
  const rawKey = context.params.key ?? [];
  if (rawKey.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const legacyUrl = `/uploads/${rawKey.map((segment) => encodeURIComponent(segment)).join("/")}`;
  const stored = await readStoredUpload(legacyUrl);
  if (!stored) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", stored.contentType ?? "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  if (stored.contentLength) headers.set("Content-Length", String(stored.contentLength));
  if (stored.etag) headers.set("ETag", stored.etag);
  if (stored.lastModified) headers.set("Last-Modified", stored.lastModified.toUTCString());

  return new NextResponse(stored.body, {
    status: 200,
    headers,
  });
}
