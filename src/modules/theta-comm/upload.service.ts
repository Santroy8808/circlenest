import { createHash, randomBytes } from "crypto";
import { EncryptedChatUploadStatus } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import {
  abortR2MultipartUpload,
  completeR2MultipartUpload,
  createPresignedR2PutRequest,
  createPresignedR2GetUrl,
  createPresignedR2UploadPartUrl,
  createR2MultipartUpload,
  deleteR2Object,
  verifyR2Object
} from "@/lib/platform/r2";
import { consumeRateLimit } from "@/lib/platform/rate-limit";
import {
  cancelThetaCommUploadSchema,
  completeThetaCommUploadSchema,
  createThetaCommUploadSchema,
  recordThetaCommUploadPartSchema,
  requestThetaCommUploadPartSchema,
  THETA_COMM_UPLOAD_CHUNK_BYTES
} from "@/modules/theta-comm/types";
import { ThetaCommError } from "@/modules/theta-comm/theta-comm.shared";

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

function ownerSegment(userId: string) {
  return createHash("sha256").update(`theta-comm-upload\0${userId}`).digest("hex").slice(0, 32);
}

function createStorageKey(userId: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `theta-comm/v2/${ownerSegment(userId)}/${date}/${randomBytes(32).toString("base64url")}.bin`;
}

function expectedPartSize(upload: { expectedSizeBytes: bigint; chunkSizeBytes: number; totalChunks: number }, partNumber: number) {
  if (partNumber < 1 || partNumber > upload.totalChunks) {
    throw new ThetaCommError(400, "INVALID_PART", "Invalid encrypted upload part.");
  }
  if (partNumber < upload.totalChunks) return upload.chunkSizeBytes;
  const preceding = BigInt(upload.chunkSizeBytes) * BigInt(upload.totalChunks - 1);
  return Number(upload.expectedSizeBytes - preceding);
}

async function requireOwnedPendingUpload(userId: string, uploadId: string) {
  const upload = await prisma.encryptedChatUpload.findFirst({
    where: {
      id: uploadId,
      ownerUserId: userId,
      status: EncryptedChatUploadStatus.PENDING
    }
  });
  if (!upload) throw new ThetaCommError(404, "UPLOAD_NOT_FOUND", "Encrypted upload was not found.");
  if (upload.expiresAt.getTime() <= Date.now()) {
    throw new ThetaCommError(410, "UPLOAD_EXPIRED", "Encrypted upload expired.");
  }
  if (!upload.r2MultipartUploadId) {
    throw new ThetaCommError(409, "UPLOAD_NOT_READY", "Encrypted upload session is unavailable.");
  }
  return upload;
}

export async function createThetaCommUpload(userId: string, input: unknown) {
  const parsed = createThetaCommUploadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThetaCommError(400, "INVALID_UPLOAD", parsed.error.issues[0]?.message ?? "Invalid encrypted upload.");
  }
  const data = parsed.data;
  const rate = await consumeRateLimit({
    namespace: "theta-comm-upload",
    key: userId,
    limit: 30,
    windowMs: 60 * 60 * 1000
  });
  if (!rate.allowed) {
    throw new ThetaCommError(429, "UPLOAD_RATE_LIMIT", "Too many encrypted uploads were started. Try again later.");
  }

  const [device, conversation] = await Promise.all([
    prisma.userDevice.findFirst({
      where: { id: data.senderDeviceId, userId, revokedAt: null, commIdentityKey: { not: null } },
      select: { id: true }
    }),
    data.conversationId
      ? prisma.encryptedChatThread.findFirst({
          where: {
            id: data.conversationId,
            participants: { some: { userId, leftAt: null, removedAt: null } }
          },
          select: { id: true }
        })
      : Promise.resolve(null)
  ]);
  if (!device) throw new ThetaCommError(400, "DEVICE_NOT_REGISTERED", "Sender device is not registered.");
  if (data.conversationId && !conversation) {
    throw new ThetaCommError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  }

  const activeUploads = await prisma.encryptedChatUpload.count({
    where: {
      ownerUserId: userId,
      status: EncryptedChatUploadStatus.PENDING,
      expiresAt: { gt: new Date() }
    }
  });
  if (activeUploads >= 10) {
    throw new ThetaCommError(409, "UPLOAD_LIMIT", "Finish or cancel an existing encrypted upload first.");
  }

  const storageKey = createStorageKey(userId);
  const thumbnailStorageKey = data.encryptedThumbnail
    ? storageKey.replace(/\.bin$/, "-thumbnail.bin")
    : null;
  const multipart = await createR2MultipartUpload({
    storageKey,
    mimeType: "application/octet-stream",
    access: "private",
    metadata: {
      "theta-comm-owner": ownerSegment(userId),
      "theta-comm-sha256": data.ciphertextSha256.toLowerCase()
    }
  });
  const totalChunks = Math.ceil(data.encryptedSizeBytes / THETA_COMM_UPLOAD_CHUNK_BYTES);
  try {
    const thumbnailUpload =
      data.encryptedThumbnail && thumbnailStorageKey
        ? await createPresignedR2PutRequest({
            storageKey: thumbnailStorageKey,
            mimeType: "application/octet-stream",
            sizeBytes: data.encryptedThumbnail.sizeBytes,
            checksumSha256: data.encryptedThumbnail.ciphertextSha256,
            access: "private",
            metadata: {
              "theta-comm-owner": ownerSegment(userId),
              "theta-comm-sha256": data.encryptedThumbnail.ciphertextSha256.toLowerCase()
            }
          })
        : null;
    const upload = await prisma.encryptedChatUpload.create({
      data: {
        ownerUserId: userId,
        ownerDeviceId: device.id,
        threadId: conversation?.id,
        storageKey,
        thumbnailStorageKey,
        thumbnailExpectedSizeBytes: data.encryptedThumbnail
          ? BigInt(data.encryptedThumbnail.sizeBytes)
          : null,
        thumbnailCiphertextSha256:
          data.encryptedThumbnail?.ciphertextSha256.toLowerCase() ?? null,
        ciphertextSha256: data.ciphertextSha256.toLowerCase(),
        expectedSizeBytes: BigInt(data.encryptedSizeBytes),
        chunkSizeBytes: THETA_COMM_UPLOAD_CHUNK_BYTES,
        totalChunks,
        r2MultipartUploadId: multipart.uploadId,
        expiresAt: new Date(Date.now() + UPLOAD_TTL_MS)
      }
    });
    return {
      uploadId: upload.id,
      chunkSizeBytes: upload.chunkSizeBytes,
      totalChunks: upload.totalChunks,
      expiresAt: upload.expiresAt.toISOString(),
      thumbnailUpload: thumbnailUpload
        ? {
            uploadUrl: thumbnailUpload.url,
            headers: thumbnailUpload.headers
          }
        : null
    };
  } catch (error) {
    await abortR2MultipartUpload({
      storageKey,
      uploadId: multipart.uploadId,
      access: "private"
    }).catch(() => undefined);
    throw error;
  }
}

export async function requestThetaCommUploadPart(userId: string, input: unknown) {
  const parsed = requestThetaCommUploadPartSchema.safeParse(input);
  if (!parsed.success) throw new ThetaCommError(400, "INVALID_PART", "Invalid encrypted upload part.");
  const upload = await requireOwnedPendingUpload(userId, parsed.data.uploadId);
  const sizeBytes = expectedPartSize(upload, parsed.data.partNumber);
  const uploadUrl = await createPresignedR2UploadPartUrl({
    storageKey: upload.storageKey,
    uploadId: upload.r2MultipartUploadId!,
    partNumber: parsed.data.partNumber,
    sizeBytes,
    access: "private"
  });
  return {
    uploadId: upload.id,
    partNumber: parsed.data.partNumber,
    sizeBytes,
    uploadUrl,
    headers: { "content-type": "application/octet-stream" }
  };
}

export async function recordThetaCommUploadPart(userId: string, input: unknown) {
  const parsed = recordThetaCommUploadPartSchema.safeParse(input);
  if (!parsed.success) throw new ThetaCommError(400, "INVALID_PART", "Invalid encrypted upload part.");
  const upload = await requireOwnedPendingUpload(userId, parsed.data.uploadId);
  const expectedSize = expectedPartSize(upload, parsed.data.partNumber);
  if (parsed.data.sizeBytes !== expectedSize) {
    throw new ThetaCommError(400, "PART_SIZE_MISMATCH", "Encrypted upload part size did not match.");
  }
  await prisma.encryptedChatUploadPart.upsert({
    where: {
      uploadId_partNumber: {
        uploadId: upload.id,
        partNumber: parsed.data.partNumber
      }
    },
    update: {
      etag: parsed.data.etag,
      sizeBytes: parsed.data.sizeBytes,
      completedAt: new Date()
    },
    create: {
      uploadId: upload.id,
      partNumber: parsed.data.partNumber,
      etag: parsed.data.etag,
      sizeBytes: parsed.data.sizeBytes
    }
  });
  const aggregate = await prisma.encryptedChatUploadPart.aggregate({
    where: { uploadId: upload.id },
    _sum: { sizeBytes: true },
    _count: true
  });
  await prisma.encryptedChatUpload.update({
    where: { id: upload.id },
    data: { uploadedSizeBytes: BigInt(aggregate._sum.sizeBytes ?? 0) }
  });
  return {
    ok: true as const,
    uploadedParts: aggregate._count,
    uploadedSizeBytes: String(aggregate._sum.sizeBytes ?? 0)
  };
}

export async function completeThetaCommUpload(userId: string, input: unknown) {
  const parsed = completeThetaCommUploadSchema.safeParse(input);
  if (!parsed.success) throw new ThetaCommError(400, "INVALID_UPLOAD", "Invalid encrypted upload completion.");
  const upload = await requireOwnedPendingUpload(userId, parsed.data.uploadId);
  if (parsed.data.ciphertextSha256.toLowerCase() !== upload.ciphertextSha256) {
    throw new ThetaCommError(409, "CHECKSUM_MISMATCH", "Encrypted attachment checksum changed.");
  }
  const parts = await prisma.encryptedChatUploadPart.findMany({
    where: { uploadId: upload.id },
    orderBy: { partNumber: "asc" }
  });
  if (
    parts.length !== upload.totalChunks ||
    parts.some((part, index) => part.partNumber !== index + 1) ||
    parts.reduce((total, part) => total + BigInt(part.sizeBytes), BigInt(0)) !== upload.expectedSizeBytes
  ) {
    throw new ThetaCommError(409, "UPLOAD_INCOMPLETE", "Encrypted upload is missing one or more parts.");
  }

  await completeR2MultipartUpload({
    storageKey: upload.storageKey,
    uploadId: upload.r2MultipartUploadId!,
    parts: parts.map((part) => ({ partNumber: part.partNumber, etag: part.etag })),
    access: "private"
  });
  const verified = await verifyR2Object({
    storageKey: upload.storageKey,
    access: "private",
    expectedSizeBytes: Number(upload.expectedSizeBytes),
    expectedMimeType: "application/octet-stream",
    label: "encrypted Theta-Comm attachment"
  });
  if (!verified.ok) {
    throw new ThetaCommError(409, "UPLOAD_VERIFICATION_FAILED", verified.error);
  }
  if (
    upload.thumbnailStorageKey &&
    upload.thumbnailExpectedSizeBytes &&
    upload.thumbnailCiphertextSha256
  ) {
    const thumbnailVerified = await verifyR2Object({
      storageKey: upload.thumbnailStorageKey,
      access: "private",
      expectedSizeBytes: Number(upload.thumbnailExpectedSizeBytes),
      expectedMimeType: "application/octet-stream",
      expectedChecksumSha256: upload.thumbnailCiphertextSha256,
      label: "encrypted Theta-Comm thumbnail"
    });
    if (!thumbnailVerified.ok) {
      throw new ThetaCommError(409, "THUMBNAIL_VERIFICATION_FAILED", thumbnailVerified.error);
    }
  }
  const completed = await prisma.encryptedChatUpload.update({
    where: { id: upload.id },
    data: {
      status: EncryptedChatUploadStatus.UPLOADED,
      uploadedSizeBytes: upload.expectedSizeBytes
    }
  });
  return {
    ok: true as const,
    uploadId: completed.id,
    encryptedSizeBytes: completed.expectedSizeBytes.toString(),
    ciphertextSha256: completed.ciphertextSha256
  };
}

export async function cancelThetaCommUpload(userId: string, input: unknown) {
  const parsed = cancelThetaCommUploadSchema.safeParse(input);
  if (!parsed.success) throw new ThetaCommError(400, "INVALID_UPLOAD", "Invalid encrypted upload.");
  const upload = await prisma.encryptedChatUpload.findFirst({
    where: {
      id: parsed.data.uploadId,
      ownerUserId: userId,
      status: EncryptedChatUploadStatus.PENDING
    }
  });
  if (!upload) return { ok: true as const };
  if (upload.r2MultipartUploadId) {
    await abortR2MultipartUpload({
      storageKey: upload.storageKey,
      uploadId: upload.r2MultipartUploadId,
      access: "private"
    }).catch(() => undefined);
  }
  if (upload.thumbnailStorageKey) {
    await deleteR2Object(upload.thumbnailStorageKey, "private").catch(() => undefined);
  }
  await prisma.encryptedChatUpload.update({
    where: { id: upload.id },
    data: { status: EncryptedChatUploadStatus.CANCELED }
  });
  return { ok: true as const };
}

export async function getThetaCommAttachmentDownload(
  userId: string,
  attachmentId: string
) {
  const attachment = await prisma.encryptedChatAttachment.findFirst({
    where: {
      id: attachmentId,
      message: {
        thread: {
          participants: { some: { userId, leftAt: null, removedAt: null } }
        }
      }
    }
  });
  if (!attachment) throw new ThetaCommError(404, "ATTACHMENT_NOT_FOUND", "Encrypted attachment not found.");
  const downloadUrl = await createPresignedR2GetUrl({
    storageKey: attachment.storageKey,
    access: "private"
  });
  const thumbnailUrl = attachment.thumbnailStorageKey
    ? await createPresignedR2GetUrl({
        storageKey: attachment.thumbnailStorageKey,
        access: "private"
      })
    : null;
  return {
    attachmentId: attachment.id,
    encryptedSizeBytes: attachment.encryptedSizeBytes.toString(),
    chunkCount: attachment.chunkCount,
    downloadUrl,
    thumbnailUrl
  };
}

export async function expireThetaCommUploads(take = 50) {
  const uploads = await prisma.encryptedChatUpload.findMany({
    where: {
      status: EncryptedChatUploadStatus.PENDING,
      expiresAt: { lte: new Date() }
    },
    orderBy: { expiresAt: "asc" },
    take
  });
  for (const upload of uploads) {
    if (upload.r2MultipartUploadId) {
      await abortR2MultipartUpload({
        storageKey: upload.storageKey,
        uploadId: upload.r2MultipartUploadId,
        access: "private"
      }).catch(() => undefined);
    }
    if (upload.thumbnailStorageKey) {
      await deleteR2Object(upload.thumbnailStorageKey, "private").catch(() => undefined);
    }
    await prisma.encryptedChatUpload.updateMany({
      where: { id: upload.id, status: EncryptedChatUploadStatus.PENDING },
      data: { status: EncryptedChatUploadStatus.EXPIRED }
    });
  }
  return { expired: uploads.length };
}
