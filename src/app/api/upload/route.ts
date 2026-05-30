import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { isSafeDocumentUpload, isSafeImageUpload } from "@/lib/security/uploads";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";
import { getUploadStorageBackend, saveUpload, saveUploadBuffer, type UploadContext, type UploadPurpose } from "@/lib/security/upload-storage";
import { canUserStoreBytes, trackUserUploadAsset } from "@/lib/media/storage-quota";
import { compressImageOnServer } from "@/lib/media/image-compress.server";

function normalizePurpose(raw: FormDataEntryValue | null): UploadPurpose {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (
    value === "profile-avatar" ||
    value === "profile-banner" ||
    value === "gallery-photo" ||
    value === "post-media" ||
    value === "auditor-attachment" ||
    value === "group-photo" ||
    value === "group-post-media" ||
    value === "group-document"
  ) {
    return value;
  }
  return "misc";
}

async function resolveUploadContext(userId: string, form: FormData): Promise<UploadContext | null> {
  const purpose = normalizePurpose(form.get("purpose"));
  const groupId = typeof form.get("groupId") === "string" ? String(form.get("groupId")).trim() : "";
  const albumId = typeof form.get("albumId") === "string" ? String(form.get("albumId")).trim() : "";
  const tagNamesRaw = typeof form.get("tagNames") === "string" ? String(form.get("tagNames")).trim() : "";
  const tags = tagNamesRaw
    ? tagNamesRaw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 30)
    : [];

  if (purpose === "group-photo" || purpose === "group-post-media" || purpose === "group-document") {
    if (!groupId) return null;
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true },
    });
    if (!membership) return null;
    return {
      ownerType: "group",
      ownerId: groupId,
      groupId,
      uploaderId: userId,
      purpose,
      albumId: albumId || null,
      tags,
    };
  }

  return {
    ownerType: "user",
    ownerId: userId,
    uploaderId: userId,
    purpose,
    albumId: albumId || null,
    tags,
  };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const uploadContext = await resolveUploadContext(session.user.id, form);
  if (!uploadContext) {
    return NextResponse.json({ error: "Invalid upload context" }, { status: 400 });
  }

  const needsSecureArea =
    uploadContext.ownerType === "user" &&
    (uploadContext.purpose === "profile-avatar" ||
      uploadContext.purpose === "profile-banner" ||
      uploadContext.purpose === "gallery-photo");
  if (needsSecureArea) {
    const locked = secureAreaLockedResponse(session.user.id);
    if (locked) return locked;
  }

  const isValidFile = (() => {
    if (uploadContext.purpose === "group-document") {
      return isSafeDocumentUpload({ size: file.size, type: file.type });
    }
    if (uploadContext.purpose === "auditor-attachment") {
      return isSafeImageUpload({ size: file.size, type: file.type }) || isSafeDocumentUpload({ size: file.size, type: file.type });
    }
    return isSafeImageUpload({ size: file.size, type: file.type });
  })();
  if (!isValidFile) {
    const message =
      uploadContext.purpose === "group-document" || uploadContext.purpose === "auditor-attachment"
        ? "Invalid document type or size"
        : "Invalid file type or size";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Client-side compression exists, but some clients/upload paths can still send originals.
  // Compress here as a server-side fallback to keep stored media predictable.
  let compression:
    | {
        originalBytes: number;
        uploadBytes: number;
        resized: boolean;
        outputType: string;
      }
    | null = null;
  let bufferToStore: Buffer | null = null;
  let contentTypeToStore: string = file.type || "application/octet-stream";
  let sizeToStore = file.size;

  if (uploadContext.purpose !== "group-document" && uploadContext.purpose !== "auditor-attachment") {
    const compressed = await compressImageOnServer(file);
    if (compressed && compressed.uploadBytes > 0) {
      bufferToStore = compressed.buffer;
      contentTypeToStore = compressed.contentType;
      sizeToStore = compressed.uploadBytes;
      compression = {
        originalBytes: compressed.originalBytes,
        uploadBytes: compressed.uploadBytes,
        resized: compressed.resized,
        outputType: compressed.outputType,
      };
    }
  }

  const quota = await canUserStoreBytes(session.user.id, sizeToStore);
  if (!quota.ok) {
    const remainingMb = (quota.remainingBytes / (1024 * 1024)).toFixed(2);
    return NextResponse.json(
      { error: `Storage limit reached. You have ${remainingMb}MB remaining out of 100MB.` },
      { status: 413 },
    );
  }

  let url: string;
  try {
    url = bufferToStore
      ? await saveUploadBuffer(bufferToStore, contentTypeToStore, file.name, uploadContext)
      : await saveUpload(file, uploadContext);
  } catch (error) {
    console.error("Upload storage failed", {
      backend: getUploadStorageBackend(),
      purpose: uploadContext.purpose,
      ownerType: uploadContext.ownerType,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Could not store uploaded file" }, { status: 500 });
  }

  await trackUserUploadAsset(session.user.id, url, sizeToStore, contentTypeToStore);
  return NextResponse.json({ ok: true, url, backend: getUploadStorageBackend(), compression });
}
