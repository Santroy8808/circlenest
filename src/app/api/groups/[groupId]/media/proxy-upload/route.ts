import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { getR2Client, readR2Config } from "@/lib/platform/r2";
import { createGroupAssetUploadIntentSchema } from "@/modules/group-media-docs/types";
import { canUploadGroupAsset, currentGroupStorageBytes, getGroupMediaContext } from "@/modules/group-media-docs/group-media-docs.service";

export async function POST(request: NextRequest, { params }: { params: { groupId: string } }) {
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

  const actor = await getActiveAccountActor(session.user.id);
  const context = await getGroupMediaContext(actor.actorUserId, params.groupId);

  if (!context?.canView) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const storageKey = String(formData.get("storageKey") ?? "");
    const kind = String(formData.get("kind") ?? "");
    const forumThreadId = String(formData.get("forumThreadId") ?? "");
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File required." }, { status: 400 });
    }

    const parsed = createGroupAssetUploadIntentSchema.safeParse({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      kind,
      forumThreadId
    });

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid group file." }, { status: 400 });
    }

    const uploadAllowed = await canUploadGroupAsset({
      groupId: context.group.id,
      canUpload: context.canUpload,
      isGroupMember: Boolean(context.membership),
      forumThreadId: parsed.data.forumThreadId
    });

    if (!uploadAllowed) {
      return NextResponse.json(
        { error: "Uploads are only available to group creators, moderators, providers, or threads with photo replies enabled." },
        { status: 403 }
      );
    }

    if (!storageKey.startsWith(`groups/${context.group.id}/`)) {
      return NextResponse.json({ error: "Invalid upload target." }, { status: 400 });
    }

    const usedBytes = await currentGroupStorageBytes(context.group.id);
    const nextBytes = usedBytes + BigInt(file.size);

    if (nextBytes > context.group.storageLimitBytes) {
      return NextResponse.json(
        { error: "This group is at its assigned storage limit. Purge group files or raise the limit before uploading." },
        { status: 400 }
      );
    }

    const r2 = readR2Config();
    if (!r2.privateBucket) {
      return NextResponse.json({ error: "Storage bucket is not configured." }, { status: 500 });
    }

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: r2.privateBucket,
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
