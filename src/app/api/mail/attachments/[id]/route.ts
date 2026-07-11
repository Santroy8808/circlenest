import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { getR2Object } from "@/lib/platform/r2";
import { getMailAttachment, isInternalMailEnabled } from "@/modules/mail/mail.service";

export const runtime = "nodejs";

function safeAttachmentName(fileName: string) {
  return fileName
    .replace(/[\r\n"]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_")
    .slice(0, 180) || "attachment";
}

function notFound() {
  return NextResponse.json(
    { error: "Mail attachment not found." },
    { status: 404, headers: { "cache-control": "private, no-store" } }
  );
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isInternalMailEnabled()) return notFound();

  const session = await auth();
  let userId = session?.user && !session.user.revoked ? session.user.id : null;

  if (!userId && /^Bearer\s+/i.test(request.headers.get("authorization") ?? "")) {
    const unavailable = mobileAuthUnavailableResponse();
    if (unavailable) return unavailable;
    const mobileSession = await requireMobileSession(request);
    userId = mobileSession?.user.id ?? null;
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Login required." },
      { status: 401, headers: { "cache-control": "private, no-store" } }
    );
  }

  const result = await getMailAttachment(userId, params.id);
  if (!result.ok) return notFound();

  try {
    const object = await getR2Object(result.attachment.storageKey, "private");
    if (!object.Body) return notFound();

    const contentLength = object.ContentLength ?? result.attachment.sizeBytes;
    return new NextResponse(object.Body.transformToWebStream(), {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${safeAttachmentName(result.attachment.fileName)}"`,
        "content-length": String(contentLength),
        "content-type": result.attachment.mimeType || "application/octet-stream",
        "x-content-type-options": "nosniff"
      }
    });
  } catch {
    return notFound();
  }
}
