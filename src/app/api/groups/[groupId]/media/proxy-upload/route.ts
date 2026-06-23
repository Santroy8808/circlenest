import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getR2Client, readR2Config } from "@/lib/platform/r2";
import { createGroupAssetUploadIntentSchema, MAX_GROUP_STORAGE_BYTES } from "@/modules/group-media-docs/types";
import { currentGroupStorageBytes, getGroupMediaContext } from "@/modules/group-media-docs/group-media-docs.service";

export async function POST(request: NextRequest, { params }: { params: { groupId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const context = await getGroupMediaContext(session.user.id, params.groupId);

  if (!context?.canView) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }

  if (!context.canUpload) {
    return NextResponse.json({ error: "Only group creators, moderators, and providers can upload group files." }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const storageKey = String(formData.get("storageKey") ?? "");
    const kind = String(formData.get("kind") ?? "");
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File required." }, { status: 400 });
    }

    const parsed = createGroupAssetUploadIntentSchema.safeParse({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      kind
    });

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid group file." }, { status: 400 });
    }

    if (!storageKey.startsWith(`groups/${context.group.id}/`)) {
      return NextResponse.json({ error: "Invalid upload target." }, { status: 400 });
    }

    const usedBytes = await currentGroupStorageBytes(context.group.id);
    const nextBytes = usedBytes + BigInt(file.size);

    if (nextBytes > BigInt(MAX_GROUP_STORAGE_BYTES)) {
      return NextResponse.json({ error: "This group is at its 40MB storage limit." }, { status: 400 });
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
        ContentType: file.type || "application/octet-stream"
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[groups.media.proxy-upload]", error);
    return NextResponse.json({ error: "File upload could not reach storage. Check connection and try again." }, { status: 500 });
  }
}
