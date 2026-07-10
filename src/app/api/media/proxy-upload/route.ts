import { PutObjectCommand } from "@aws-sdk/client-s3";
import { MediaVisibility, UploadIntentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveAccountActor } from "@/lib/platform/account-actor";
import { prisma } from "@/lib/platform/db";
import { getR2Client, readR2Config } from "@/lib/platform/r2";
import { getUploadIntentPolicy, uploadIntentMetadata } from "@/modules/media/upload-intent.service";

function requestedVisibility(requestedAccess: string) {
  if (requestedAccess === "public") return MediaVisibility.PUBLIC;
  if (requestedAccess === "private") return MediaVisibility.PRIVATE;
  return null;
}

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

async function authorizedUploadTarget(storageKey: string, userId: string, requestedAccess: string, file: File) {
  const visibility = requestedVisibility(requestedAccess);
  if (!visibility) return { ok: false as const, status: 400, error: "Invalid upload access." };

  const intent = await prisma.uploadIntent.findFirst({
    where: {
      ownerUserId: userId,
      storageKey,
      status: UploadIntentStatus.PENDING,
      expiresAt: { gt: new Date() }
    },
    select: {
      id: true,
      ownerUserId: true,
      purpose: true,
      declaredChecksumSha256: true,
      declaredMimeType: true,
      declaredSizeBytes: true,
      visibility: true
    }
  });

  if (!intent) return { ok: false as const, status: 404, error: "Upload intent was not found or has expired." };
  if (intent.visibility !== visibility) return { ok: false as const, status: 400, error: "Upload access does not match the prepared intent." };

  const policy = getUploadIntentPolicy(intent.purpose);
  const mimeType = normalizeMimeType(file.type);
  if (!policy.allowedMimeTypes.includes(mimeType) || mimeType !== intent.declaredMimeType) {
    return { ok: false as const, status: 400, error: "File type does not match the prepared upload." };
  }

  const declaredSizeBytes = Number(intent.declaredSizeBytes);
  if (file.size <= 0 || file.size > policy.maxSizeBytes || file.size !== declaredSizeBytes) {
    return { ok: false as const, status: 400, error: "File size does not match the prepared upload." };
  }

  return {
    ok: true as const,
    access: visibility === MediaVisibility.PUBLIC ? "public" as const : "private" as const,
    mimeType,
    metadata: uploadIntentMetadata(intent)
  };
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
    const target = await authorizedUploadTarget(storageKey, actor.actorUserId, requestedAccess, file);

    if (!target.ok) {
      return NextResponse.json({ error: target.error }, { status: target.status });
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
        ContentType: target.mimeType,
        Metadata: target.metadata
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[media.proxy-upload]", error);
    return NextResponse.json({ error: "Image upload could not reach storage. Check connection and try again." }, { status: 500 });
  }
}
