import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { getR2Client, readR2Config } from "@/lib/platform/r2";
import { MAX_CHAT_ATTACHMENT_BYTES } from "@/modules/chat-messages/types";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/modules/gallery-media-storage/types";
import { MAX_MAIL_ATTACHMENT_BYTES } from "@/modules/mail/types";
import { MAX_MARKET_PHOTO_BYTES } from "@/modules/market/types";
import { MAX_RESUME_UPLOAD_BYTES } from "@/modules/profile-resume/types";

function authorizedUploadTarget(storageKey: string, userId: string, requestedAccess: string) {
  if (storageKey.startsWith(`users/${userId}/my-pics/`)) {
    if (requestedAccess !== "public" && requestedAccess !== "private") return { ok: false as const };
    return { ok: true as const, maxBytes: MAX_IMAGE_UPLOAD_BYTES, imageOnly: true, access: requestedAccess };
  }

  if (storageKey.startsWith(`users/${userId}/stream-images/`)) {
    return { ok: true as const, maxBytes: MAX_IMAGE_UPLOAD_BYTES, imageOnly: true, access: "private" as const };
  }

  if (storageKey.startsWith(`users/${userId}/ad-creatives/`)) {
    return { ok: true as const, maxBytes: MAX_IMAGE_UPLOAD_BYTES, imageOnly: true, access: "public" as const };
  }

  if (storageKey.startsWith(`users/${userId}/chat/`)) {
    return { ok: true as const, maxBytes: MAX_CHAT_ATTACHMENT_BYTES, imageOnly: false, access: "private" as const };
  }

  if (storageKey.startsWith(`users/${userId}/mail/`)) {
    return { ok: true as const, maxBytes: MAX_MAIL_ATTACHMENT_BYTES, imageOnly: false, access: "private" as const };
  }

  if (storageKey.startsWith(`users/${userId}/resume/`)) {
    return { ok: true as const, maxBytes: MAX_RESUME_UPLOAD_BYTES, imageOnly: false, access: "private" as const };
  }

  if (storageKey.startsWith(`market/${userId}/`)) {
    return { ok: true as const, maxBytes: MAX_MARKET_PHOTO_BYTES, imageOnly: true, access: "public" as const };
  }

  return { ok: false as const };
}

export async function POST(request: NextRequest) {
  if (process.env.UPLOAD_PROXY_FALLBACK_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Direct upload fallback is temporarily unavailable. Check your connection and try again." },
      { status: 503, headers: { "cache-control": "no-store", "retry-after": "30" } }
    );
  }

  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const storageKey = String(formData.get("storageKey") ?? "");
    const requestedAccess = String(formData.get("access") ?? "").toLowerCase();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file required." }, { status: 400 });
    }

    const actor = await getActiveAccountActor(session.user.id);
    const target = authorizedUploadTarget(storageKey, actor.actorUserId, requestedAccess);

    if (!target.ok) {
      return NextResponse.json({ error: "Invalid upload target." }, { status: 400 });
    }

    if (target.imageOnly && !/^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
      return NextResponse.json({ error: "Only JPG, PNG, GIF, or WebP images can be uploaded." }, { status: 400 });
    }

    if (file.size <= 0 || file.size > target.maxBytes) {
      return NextResponse.json({ error: `Upload must be ${Math.round(target.maxBytes / (1024 * 1024))}MB or smaller.` }, { status: 400 });
    }

    const r2 = readR2Config();
    const bucket = target.access === "private" ? r2.privateBucket : r2.bucket;
    if (!bucket) {
      return NextResponse.json({ error: "Storage bucket is not configured." }, { status: 500 });
    }

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentLength: file.size,
        ContentType: file.type
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[media.proxy-upload]", error);
    return NextResponse.json({ error: "Image upload could not reach storage. Check connection and try again." }, { status: 500 });
  }
}
