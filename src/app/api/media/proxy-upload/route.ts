import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getR2Client, readR2Config } from "@/lib/platform/r2";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/modules/gallery-media-storage/types";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const storageKey = String(formData.get("storageKey") ?? "");
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file required." }, { status: 400 });
    }

    if (!storageKey.startsWith(`users/${session.user.id}/my-pics/`)) {
      return NextResponse.json({ error: "Invalid upload target." }, { status: 400 });
    }

    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
      return NextResponse.json({ error: "Only JPG, PNG, GIF, or WebP images can be uploaded." }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image must be 10MB or smaller." }, { status: 400 });
    }

    const r2 = readR2Config();
    if (!r2.bucket) {
      return NextResponse.json({ error: "Storage bucket is not configured." }, { status: 500 });
    }

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: r2.bucket,
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
