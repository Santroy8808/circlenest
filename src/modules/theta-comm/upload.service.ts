import { createHash, randomBytes } from "crypto";
import { EncryptedChatUploadStatus } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { consumeRateLimit } from "@/lib/platform/rate-limit";
import {
  cancelThetaCommUploadSchema,
  completeThetaCommUploadSchema,
  createThetaCommUploadSchema,
  thetaCommUploadStatusSchema,
  THETA_COMM_UPLOAD_CHUNK_BYTES
} from "@/modules/theta-comm/types";
import { ThetaCommError } from "@/modules/theta-comm/theta-comm.shared";
import {
  finalizeThetaCommUpload,
  pendingThetaCommPartSize,
  removePendingThetaCommUpload,
  thetaCommStoredObject,
  writePendingThetaCommPart,
  writePendingThetaCommThumbnail
} from "@/modules/theta-comm/blob-storage";

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

function ownerSegment(userId: string) {
  return createHash("sha256")
    .update(`theta-comm-upload\0${userId}`)
    .digest("hex")
    .slice(0, 32);
}

function createStorageKey(userId: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `v2/${ownerSegment(userId)}/${date}/${randomBytes(32).toString("base64url")}.bin`;
}

function expectedPartSize(
  upload: {
    expectedSizeBytes: bigint;
    chunkSizeBytes: number;
    totalChunks: number;
  },
  partNumber: number
) {
  if (
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > upload.totalChunks
  ) {
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
  if (!upload) {
    throw new ThetaCommError(404, "UPLOAD_NOT_FOUND", "Encrypted upload was not found.");
  }
  if (upload.expiresAt.getTime() <= Date.now()) {
    throw new ThetaCommError(410, "UPLOAD_EXPIRED", "Encrypted upload expired.");
  }
  return upload;
}

export async function createThetaCommUpload(userId: string, input: unknown) {
  const parsed = createThetaCommUploadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThetaCommError(
      400,
      "INVALID_UPLOAD",
      parsed.error.issues[0]?.message ?? "Invalid encrypted upload."
    );
  }
  const data = parsed.data;
  const rate = await consumeRateLimit({
    namespace: "theta-comm-upload",
    key: userId,
    limit: 30,
    windowMs: 60 * 60 * 1000
  });
  if (!rate.allowed) {
    throw new ThetaCommError(
      429,
      "UPLOAD_RATE_LIMIT",
      "Too many encrypted uploads were started. Try again later."
    );
  }

  const [device, conversation] = await Promise.all([
    prisma.userDevice.findFirst({
      where: {
        id: data.senderDeviceId,
        userId,
        revokedAt: null,
        commIdentityKey: { not: null }
      },
      select: { id: true }
    }),
    data.conversationId
      ? prisma.encryptedChatThread.findFirst({
          where: {
            id: data.conversationId,
            participants: {
              some: { userId, leftAt: null, removedAt: null }
            }
          },
          select: { id: true }
        })
      : Promise.resolve(null)
  ]);
  if (!device) {
    throw new ThetaCommError(
      400,
      "DEVICE_NOT_REGISTERED",
      "Sender device is not registered."
    );
  }
  if (data.conversationId && !conversation) {
    throw new ThetaCommError(
      404,
      "CONVERSATION_NOT_FOUND",
      "Conversation not found."
    );
  }

  const activeUploads = await prisma.encryptedChatUpload.count({
    where: {
      ownerUserId: userId,
      status: EncryptedChatUploadStatus.PENDING,
      expiresAt: { gt: new Date() }
    }
  });
  if (activeUploads >= 10) {
    throw new ThetaCommError(
      409,
      "UPLOAD_LIMIT",
      "Finish or cancel an existing encrypted upload first."
    );
  }

  const storageKey = createStorageKey(userId);
  const upload = await prisma.encryptedChatUpload.create({
    data: {
      ownerUserId: userId,
      ownerDeviceId: device.id,
      threadId: conversation?.id,
      storageKey,
      thumbnailStorageKey: data.encryptedThumbnail
        ? storageKey.replace(/\.bin$/, "-thumbnail.bin")
        : null,
      thumbnailExpectedSizeBytes: data.encryptedThumbnail
        ? BigInt(data.encryptedThumbnail.sizeBytes)
        : null,
      thumbnailCiphertextSha256:
        data.encryptedThumbnail?.ciphertextSha256.toLowerCase() ?? null,
      ciphertextSha256: data.ciphertextSha256.toLowerCase(),
      expectedSizeBytes: BigInt(data.encryptedSizeBytes),
      chunkSizeBytes: THETA_COMM_UPLOAD_CHUNK_BYTES,
      totalChunks: Math.ceil(
        data.encryptedSizeBytes / THETA_COMM_UPLOAD_CHUNK_BYTES
      ),
      expiresAt: new Date(Date.now() + UPLOAD_TTL_MS)
    }
  });
  return {
    uploadId: upload.id,
    chunkSizeBytes: upload.chunkSizeBytes,
    totalChunks: upload.totalChunks,
    expiresAt: upload.expiresAt.toISOString(),
    thumbnailRequired: Boolean(upload.thumbnailStorageKey)
  };
}

export async function writeThetaCommUploadPart(
  userId: string,
  uploadId: string,
  partNumber: number,
  bytes: Buffer
) {
  const upload = await requireOwnedPendingUpload(userId, uploadId);
  const expectedSize = expectedPartSize(upload, partNumber);
  if (bytes.length !== expectedSize) {
    throw new ThetaCommError(
      400,
      "PART_SIZE_MISMATCH",
      "Encrypted upload part size did not match."
    );
  }
  const etag = await writePendingThetaCommPart(upload.id, partNumber, bytes);
  await prisma.encryptedChatUploadPart.upsert({
    where: {
      uploadId_partNumber: {
        uploadId: upload.id,
        partNumber
      }
    },
    update: {
      etag,
      sizeBytes: bytes.length,
      completedAt: new Date()
    },
    create: {
      uploadId: upload.id,
      partNumber,
      etag,
      sizeBytes: bytes.length
    }
  });
  const aggregate = await prisma.encryptedChatUploadPart.aggregate({
    where: { uploadId: upload.id },
    _sum: { sizeBytes: true }
  });
  await prisma.encryptedChatUpload.update({
    where: { id: upload.id },
    data: { uploadedSizeBytes: BigInt(aggregate._sum.sizeBytes ?? 0) }
  });
  return { ok: true as const, etag };
}

export async function writeThetaCommUploadThumbnail(
  userId: string,
  uploadId: string,
  bytes: Buffer
) {
  const upload = await requireOwnedPendingUpload(userId, uploadId);
  if (
    !upload.thumbnailStorageKey ||
    !upload.thumbnailExpectedSizeBytes ||
    !upload.thumbnailCiphertextSha256
  ) {
    throw new ThetaCommError(
      409,
      "THUMBNAIL_NOT_EXPECTED",
      "This encrypted upload does not include a thumbnail."
    );
  }
  if (BigInt(bytes.length) !== upload.thumbnailExpectedSizeBytes) {
    throw new ThetaCommError(
      400,
      "THUMBNAIL_SIZE_MISMATCH",
      "Encrypted thumbnail size did not match."
    );
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== upload.thumbnailCiphertextSha256) {
    throw new ThetaCommError(
      409,
      "THUMBNAIL_CHECKSUM_MISMATCH",
      "Encrypted thumbnail checksum did not match."
    );
  }
  await writePendingThetaCommThumbnail(upload.id, bytes);
  return { ok: true as const };
}

export async function getThetaCommUploadStatus(
  userId: string,
  input: unknown
) {
  const parsed = thetaCommUploadStatusSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThetaCommError(
      400,
      "INVALID_UPLOAD",
      "Invalid encrypted upload."
    );
  }
  const upload = await prisma.encryptedChatUpload.findFirst({
    where: {
      id: parsed.data.uploadId,
      ownerUserId: userId,
      status: {
        in: [
          EncryptedChatUploadStatus.PENDING,
          EncryptedChatUploadStatus.UPLOADED
        ]
      }
    },
    include: {
      parts: {
        orderBy: { partNumber: "asc" },
        select: { partNumber: true, sizeBytes: true }
      }
    }
  });
  if (!upload) {
    throw new ThetaCommError(
      404,
      "UPLOAD_NOT_FOUND",
      "Encrypted upload was not found."
    );
  }
  if (
    upload.status === EncryptedChatUploadStatus.PENDING &&
    upload.expiresAt.getTime() <= Date.now()
  ) {
    throw new ThetaCommError(410, "UPLOAD_EXPIRED", "Encrypted upload expired.");
  }
  const completedParts =
    upload.status === EncryptedChatUploadStatus.PENDING
      ? (
          await Promise.all(
            upload.parts.map(async (part) => ({
              part,
              storedSize: await pendingThetaCommPartSize(
                upload.id,
                part.partNumber
              ).catch(() => -1)
            }))
          )
        )
          .filter(({ part, storedSize }) => part.sizeBytes === storedSize)
          .map(({ part }) => part)
      : upload.parts;
  return {
    uploadId: upload.id,
    status: upload.status,
    chunkSizeBytes: upload.chunkSizeBytes,
    totalChunks: upload.totalChunks,
    encryptedSizeBytes: upload.expectedSizeBytes.toString(),
    uploadedSizeBytes: completedParts
      .reduce((total, part) => total + BigInt(part.sizeBytes), BigInt(0))
      .toString(),
    completedPartNumbers: completedParts.map((part) => part.partNumber),
    expiresAt: upload.expiresAt.toISOString(),
    thumbnailRequired: Boolean(upload.thumbnailStorageKey)
  };
}

export async function completeThetaCommUpload(userId: string, input: unknown) {
  const parsed = completeThetaCommUploadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThetaCommError(
      400,
      "INVALID_UPLOAD",
      "Invalid encrypted upload completion."
    );
  }
  const upload = await requireOwnedPendingUpload(userId, parsed.data.uploadId);
  if (
    parsed.data.ciphertextSha256.toLowerCase() !== upload.ciphertextSha256
  ) {
    throw new ThetaCommError(
      409,
      "CHECKSUM_MISMATCH",
      "Encrypted attachment checksum changed."
    );
  }
  const parts = await prisma.encryptedChatUploadPart.findMany({
    where: { uploadId: upload.id },
    orderBy: { partNumber: "asc" }
  });
  if (
    parts.length !== upload.totalChunks ||
    parts.some((part, index) => part.partNumber !== index + 1) ||
    parts.reduce(
      (total, part) => total + BigInt(part.sizeBytes),
      BigInt(0)
    ) !== upload.expectedSizeBytes
  ) {
    throw new ThetaCommError(
      409,
      "UPLOAD_INCOMPLETE",
      "Encrypted upload is missing one or more parts."
    );
  }
  for (const part of parts) {
    const storedSize = await pendingThetaCommPartSize(upload.id, part.partNumber)
      .catch(() => -1);
    if (storedSize !== part.sizeBytes) {
      throw new ThetaCommError(
        409,
        "UPLOAD_INCOMPLETE",
        "Encrypted upload is missing one or more parts."
      );
    }
  }

  try {
    await finalizeThetaCommUpload({
      uploadId: upload.id,
      storageKey: upload.storageKey,
      thumbnailStorageKey: upload.thumbnailStorageKey,
      totalChunks: upload.totalChunks,
      expectedSizeBytes: upload.expectedSizeBytes,
      ciphertextSha256: upload.ciphertextSha256,
      thumbnailExpectedSizeBytes: upload.thumbnailExpectedSizeBytes,
      thumbnailCiphertextSha256: upload.thumbnailCiphertextSha256
    });
  } catch (error) {
    throw new ThetaCommError(
      409,
      "UPLOAD_VERIFICATION_FAILED",
      error instanceof Error
        ? error.message
        : "Encrypted attachment failed server verification."
    );
  }

  const completed = await prisma.encryptedChatUpload.update({
    where: { id: upload.id },
    data: {
      status: EncryptedChatUploadStatus.UPLOADED,
      uploadedSizeBytes: upload.expectedSizeBytes
    }
  });
  await removePendingThetaCommUpload(upload.id).catch(() => undefined);
  return {
    ok: true as const,
    uploadId: completed.id,
    encryptedSizeBytes: completed.expectedSizeBytes.toString(),
    ciphertextSha256: completed.ciphertextSha256
  };
}

export async function cancelThetaCommUpload(userId: string, input: unknown) {
  const parsed = cancelThetaCommUploadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThetaCommError(
      400,
      "INVALID_UPLOAD",
      "Invalid encrypted upload."
    );
  }
  const upload = await prisma.encryptedChatUpload.findFirst({
    where: {
      id: parsed.data.uploadId,
      ownerUserId: userId,
      status: EncryptedChatUploadStatus.PENDING
    }
  });
  if (!upload) return { ok: true as const };
  await removePendingThetaCommUpload(upload.id).catch(() => undefined);
  await prisma.encryptedChatUpload.update({
    where: { id: upload.id },
    data: { status: EncryptedChatUploadStatus.CANCELED }
  });
  return { ok: true as const };
}

async function requireThetaCommAttachment(
  userId: string,
  attachmentId: string
) {
  const attachment = await prisma.encryptedChatAttachment.findFirst({
    where: {
      id: attachmentId,
      message: {
        thread: {
          participants: {
            some: { userId, leftAt: null, removedAt: null }
          }
        }
      }
    }
  });
  if (!attachment) {
    throw new ThetaCommError(
      404,
      "ATTACHMENT_NOT_FOUND",
      "Encrypted attachment not found."
    );
  }
  return attachment;
}

export async function getThetaCommAttachmentDownload(
  userId: string,
  attachmentId: string
) {
  const attachment = await requireThetaCommAttachment(userId, attachmentId);
  return {
    attachmentId: attachment.id,
    encryptedSizeBytes: attachment.encryptedSizeBytes.toString(),
    chunkCount: attachment.chunkCount,
    downloadUrl: `/api/mobile/comm/attachments/${attachment.id}/content`,
    thumbnailUrl: attachment.thumbnailStorageKey
      ? `/api/mobile/comm/attachments/${attachment.id}/thumbnail`
      : null
  };
}

export async function getThetaCommAttachmentFile(
  userId: string,
  attachmentId: string,
  thumbnail = false
) {
  const attachment = await requireThetaCommAttachment(userId, attachmentId);
  const storageKey = thumbnail
    ? attachment.thumbnailStorageKey
    : attachment.storageKey;
  if (!storageKey) {
    throw new ThetaCommError(
      404,
      "ATTACHMENT_NOT_FOUND",
      "Encrypted attachment content not found."
    );
  }
  return thetaCommStoredObject(storageKey).catch(() => {
    throw new ThetaCommError(
      404,
      "ATTACHMENT_NOT_FOUND",
      "Encrypted attachment content not found."
    );
  });
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
    await removePendingThetaCommUpload(upload.id).catch(() => undefined);
    await prisma.encryptedChatUpload.updateMany({
      where: {
        id: upload.id,
        status: EncryptedChatUploadStatus.PENDING
      },
      data: { status: EncryptedChatUploadStatus.EXPIRED }
    });
  }
  return { expired: uploads.length };
}
