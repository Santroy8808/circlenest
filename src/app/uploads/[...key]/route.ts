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

  return new NextResponse(stored.body, {
    status: 200,
    headers: {
      "Content-Type": stored.contentType ?? "application/octet-stream",
      "Content-Length": stored.contentLength ? String(stored.contentLength) : undefined,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: stored.etag ?? undefined,
      "Last-Modified": stored.lastModified ? stored.lastModified.toUTCString() : undefined,
    },
  });
}
