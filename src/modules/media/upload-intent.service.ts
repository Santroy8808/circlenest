import { createHash, randomBytes } from "crypto";
import {
  MediaVisibility,
  Prisma,
  UploadIntentPurpose,
  UploadIntentStatus,
  type UploadIntent
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { consumeRateLimit } from "@/lib/platform/rate-limit";
import { canUserAccessFeature, getEffectivePolicyForUser } from "@/modules/membership-policy/membership-policy.service";
import {
  createPresignedR2PutRequest,
  deleteR2Object,
  normalizeSha256Checksum,
  verifyR2Object
} from "@/lib/platform/r2";

const MODULE_KEY = "upload-intent";
const UPLOAD_INTENT_TTL_MS = 5 * 60 * 1000;
const VERIFIED_CONSUMPTION_TTL_MS = 10 * 60 * 1000;
const VERIFYING_EXPIRY_GRACE_MS = 60 * 1000;
const MAX_CLEANUP_BATCH_SIZE = 500;
const MAX_ACTIVE_UPLOAD_INTENTS_PER_OWNER = 10;
const MAX_ACTIVE_DECLARED_UPLOAD_BYTES_PER_OWNER = BigInt(100 * 1024 * 1024);

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const STATIC_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
] as const;

type UploadIntentPolicy = {
  allowedMimeTypes: readonly string[];
  allowedVisibilities: readonly MediaVisibility[];
  defaultVisibility: MediaVisibility;
  maxSizeBytes: number;
};

const UPLOAD_INTENT_POLICIES: Record<UploadIntentPurpose, UploadIntentPolicy> = {
  [UploadIntentPurpose.GALLERY]: {
    allowedMimeTypes: IMAGE_MIME_TYPES,
    allowedVisibilities: [MediaVisibility.PRIVATE, MediaVisibility.MEMBERS, MediaVisibility.PUBLIC],
    defaultVisibility: MediaVisibility.PRIVATE,
    maxSizeBytes: 10 * 1024 * 1024
  },
  [UploadIntentPurpose.STREAM_POST]: {
    allowedMimeTypes: IMAGE_MIME_TYPES,
    allowedVisibilities: [MediaVisibility.PUBLIC],
    defaultVisibility: MediaVisibility.PUBLIC,
    maxSizeBytes: 10 * 1024 * 1024
  },
  [UploadIntentPurpose.STREAM_REPLY]: {
    allowedMimeTypes: IMAGE_MIME_TYPES,
    allowedVisibilities: [MediaVisibility.PUBLIC],
    defaultVisibility: MediaVisibility.PUBLIC,
    maxSizeBytes: 10 * 1024 * 1024
  },
  [UploadIntentPurpose.AD_CREATIVE]: {
    allowedMimeTypes: STATIC_IMAGE_MIME_TYPES,
    allowedVisibilities: [MediaVisibility.PUBLIC],
    defaultVisibility: MediaVisibility.PUBLIC,
    maxSizeBytes: 10 * 1024 * 1024
  },
  [UploadIntentPurpose.PROFILE_MEDIA]: {
    allowedMimeTypes: [...STATIC_IMAGE_MIME_TYPES, "application/pdf"],
    allowedVisibilities: [MediaVisibility.PRIVATE, MediaVisibility.MEMBERS, MediaVisibility.PUBLIC],
    defaultVisibility: MediaVisibility.MEMBERS,
    maxSizeBytes: 15 * 1024 * 1024
  },
  [UploadIntentPurpose.BUSINESS_MEDIA]: {
    allowedMimeTypes: STATIC_IMAGE_MIME_TYPES,
    allowedVisibilities: [MediaVisibility.PUBLIC],
    defaultVisibility: MediaVisibility.PUBLIC,
    maxSizeBytes: 15 * 1024 * 1024
  },
  [UploadIntentPurpose.CHAT_ATTACHMENT]: {
    allowedMimeTypes: [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES],
    allowedVisibilities: [MediaVisibility.PRIVATE],
    defaultVisibility: MediaVisibility.PRIVATE,
    maxSizeBytes: 20 * 1024 * 1024
  },
  [UploadIntentPurpose.MAIL_ATTACHMENT]: {
    allowedMimeTypes: [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES],
    allowedVisibilities: [MediaVisibility.PRIVATE],
    defaultVisibility: MediaVisibility.PRIVATE,
    maxSizeBytes: 20 * 1024 * 1024
  },
  [UploadIntentPurpose.GROUP_ASSET]: {
    allowedMimeTypes: [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES],
    allowedVisibilities: [MediaVisibility.PRIVATE],
    defaultVisibility: MediaVisibility.PRIVATE,
    maxSizeBytes: 20 * 1024 * 1024
  },
  [UploadIntentPurpose.MARKET_LISTING]: {
    allowedMimeTypes: STATIC_IMAGE_MIME_TYPES,
    allowedVisibilities: [MediaVisibility.PUBLIC],
    defaultVisibility: MediaVisibility.PUBLIC,
    maxSizeBytes: 10 * 1024 * 1024
  },
  [UploadIntentPurpose.RESUME]: {
    allowedMimeTypes: DOCUMENT_MIME_TYPES.filter((mimeType) => mimeType !== "text/plain"),
    allowedVisibilities: [MediaVisibility.PRIVATE],
    defaultVisibility: MediaVisibility.PRIVATE,
    maxSizeBytes: 8 * 1024 * 1024
  }
};

const createUploadIntentInputSchema = z
  .object({
    checksumSha256: z.string().trim().max(160).optional().nullable(),
    mimeType: z.string().trim().min(1).max(160),
    purpose: z.nativeEnum(UploadIntentPurpose),
    sizeBytes: z.number().int().positive().safe(),
    visibility: z.nativeEnum(MediaVisibility).optional()
  })
  .strict();

const uploadIntentReferenceSchema = z.object({
  intentId: z.string().trim().min(1).max(80)
});

export const VERIFIED_UPLOAD_INTENT_STATUS = UploadIntentStatus.VERIFIED;

export type UploadIntentErrorCode =
  | "INVALID_UPLOAD"
  | "NOT_FOUND"
  | "EXPIRED"
  | "REVOKED"
  | "ALREADY_USED"
  | "NOT_VERIFIED"
  | "PURPOSE_MISMATCH"
  | "OBJECT_REJECTED"
  | "CONFLICT"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "STORAGE_UNAVAILABLE";

export type UploadIntentFailure = {
  ok: false;
  code: UploadIntentErrorCode;
  error: string;
};

export type VerifiedUploadIntent = Pick<
  UploadIntent,
  | "id"
  | "ownerUserId"
  | "storageKey"
  | "purpose"
  | "declaredMimeType"
  | "declaredSizeBytes"
  | "visibility"
  | "expiresAt"
  | "completedAt"
  | "verifiedAt"
  | "declaredChecksumSha256"
  | "observedMimeType"
  | "observedSizeBytes"
  | "observedChecksumSha256"
> & {
  completedAt: Date;
  verifiedAt: Date;
};

function failure(code: UploadIntentErrorCode, error: string): UploadIntentFailure {
  return { ok: false, code, error };
}

function normalizeMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function storageAccess(visibility: MediaVisibility) {
  return visibility === MediaVisibility.PUBLIC ? "public" as const : "private" as const;
}

function ownerBinding(ownerUserId: string) {
  return createHash("sha256").update(`theta-upload-owner\0${ownerUserId}`).digest("hex");
}

export function uploadIntentMetadata(intent: Pick<UploadIntent, "id" | "ownerUserId" | "purpose" | "declaredChecksumSha256">) {
  return {
    "theta-intent-id": intent.id,
    "theta-owner-binding": ownerBinding(intent.ownerUserId),
    "theta-purpose": intent.purpose.toLowerCase(),
    ...(intent.declaredChecksumSha256 ? { "theta-declared-sha256": intent.declaredChecksumSha256 } : {})
  };
}

function createStorageKey(ownerUserId: string, purpose: UploadIntentPurpose, now: Date) {
  const ownerSegment = ownerBinding(ownerUserId).slice(0, 32);
  const purposeSegment = purpose.toLowerCase().replace(/_/g, "-");
  const dateSegment = now.toISOString().slice(0, 10);
  const nonce = randomBytes(32).toString("base64url");

  return `upload-intents/${ownerSegment}/${purposeSegment}/${dateSegment}/${nonce}`;
}

function publicIntentView(intent: Pick<UploadIntent, "id" | "storageKey" | "purpose" | "declaredMimeType" | "declaredSizeBytes" | "visibility" | "expiresAt" | "declaredChecksumSha256">) {
  return {
    id: intent.id,
    storageKey: intent.storageKey,
    purpose: intent.purpose,
    mimeType: intent.declaredMimeType,
    sizeBytes: intent.declaredSizeBytes.toString(),
    visibility: intent.visibility,
    expiresAt: intent.expiresAt.toISOString(),
    checksumSha256: intent.declaredChecksumSha256
  };
}

function verifiedIntentView(intent: Pick<UploadIntent, "id" | "storageKey" | "purpose" | "declaredMimeType" | "declaredSizeBytes" | "visibility" | "verifiedAt" | "declaredChecksumSha256">) {
  return {
    id: intent.id,
    storageKey: intent.storageKey,
    purpose: intent.purpose,
    mimeType: intent.declaredMimeType,
    sizeBytes: intent.declaredSizeBytes.toString(),
    visibility: intent.visibility,
    checksumSha256: intent.declaredChecksumSha256,
    verifiedAt: intent.verifiedAt?.toISOString() ?? null,
    verification: "VERIFIED" as const
  };
}

export function getUploadIntentPolicy(purpose: UploadIntentPurpose) {
  const policy = UPLOAD_INTENT_POLICIES[purpose];

  return {
    allowedMimeTypes: [...policy.allowedMimeTypes],
    allowedVisibilities: [...policy.allowedVisibilities],
    defaultVisibility: policy.defaultVisibility,
    maxSizeBytes: policy.maxSizeBytes,
    expiresInSeconds: Math.floor(UPLOAD_INTENT_TTL_MS / 1000)
  };
}

export async function createUploadIntent(ownerUserId: string, input: unknown) {
  const cleanOwnerUserId = ownerUserId.trim();
  const parsed = createUploadIntentInputSchema.safeParse(input);

  if (!cleanOwnerUserId || !parsed.success) {
    return failure("INVALID_UPLOAD", parsed.success ? "A member is required." : parsed.error.issues[0]?.message ?? "Invalid upload.");
  }

  const requestRate = await consumeRateLimit({
    namespace: "upload-intent:owner",
    key: cleanOwnerUserId,
    limit: 30,
    windowMs: 60 * 60 * 1000
  });
  if (!requestRate.allowed) {
    return {
      ...failure("RATE_LIMITED", "Too many uploads were started. Try again later."),
      retryAfterSeconds: requestRate.retryAfterSeconds
    };
  }

  const policy = UPLOAD_INTENT_POLICIES[parsed.data.purpose];
  if (parsed.data.purpose === UploadIntentPurpose.BUSINESS_MEDIA) {
    const businessAccess = await canUserAccessFeature(cleanOwnerUserId, "market.storefront");
    if (!businessAccess.allowed) {
      return failure("INVALID_UPLOAD", businessAccess.reason ?? "Business media access required.");
    }
  }
  const mimeType = normalizeMimeType(parsed.data.mimeType);
  const visibility = parsed.data.visibility ?? policy.defaultVisibility;

  if (!policy.allowedMimeTypes.includes(mimeType)) {
    return failure("INVALID_UPLOAD", `This file type is not allowed for ${parsed.data.purpose.toLowerCase().replace(/_/g, " ")}.`);
  }

  if (parsed.data.sizeBytes > policy.maxSizeBytes) {
    return failure("INVALID_UPLOAD", `This upload exceeds the ${Math.floor(policy.maxSizeBytes / (1024 * 1024))} MB limit.`);
  }

  if (!policy.allowedVisibilities.includes(visibility)) {
    return failure("INVALID_UPLOAD", "That visibility is not allowed for this upload purpose.");
  }

  let checksumSha256: string | null;
  try {
    checksumSha256 = normalizeSha256Checksum(parsed.data.checksumSha256);
  } catch (error) {
    return failure("INVALID_UPLOAD", error instanceof Error ? error.message : "Invalid SHA-256 checksum.");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + UPLOAD_INTENT_TTL_MS);
  const [owner, activeIntents, storedAssets, effectivePolicy] = await Promise.all([
    prisma.user.findFirst({
      where: { id: cleanOwnerUserId, deactivatedAt: null },
      select: { id: true }
    }),
    prisma.uploadIntent.aggregate({
      where: {
        ownerUserId: cleanOwnerUserId,
        status: {
          in: [UploadIntentStatus.PENDING, UploadIntentStatus.VERIFYING, UploadIntentStatus.VERIFIED]
        },
        expiresAt: { gt: now }
      },
      _count: { _all: true },
      _sum: { declaredSizeBytes: true }
    }),
    prisma.mediaAsset.aggregate({
      where: { ownerUserId: cleanOwnerUserId, status: "READY" },
      _sum: { sizeBytes: true }
    }),
    getEffectivePolicyForUser(cleanOwnerUserId)
  ]);

  if (!owner) {
    return failure("INVALID_UPLOAD", "An active member is required.");
  }

  if (!effectivePolicy) {
    return failure("INVALID_UPLOAD", "An active membership is required.");
  }

  const activeDeclaredBytes = activeIntents._sum.declaredSizeBytes ?? BigInt(0);
  const storedBytes = storedAssets._sum.sizeBytes ?? BigInt(0);
  const storageLimitBytes = BigInt(effectivePolicy.limits.storageLimitBytes);
  if (storedBytes + activeDeclaredBytes + BigInt(parsed.data.sizeBytes) > storageLimitBytes) {
    return failure("QUOTA_EXCEEDED", "This upload would exceed your account storage limit.");
  }
  if (
    activeIntents._count._all >= MAX_ACTIVE_UPLOAD_INTENTS_PER_OWNER ||
    activeDeclaredBytes + BigInt(parsed.data.sizeBytes) > MAX_ACTIVE_DECLARED_UPLOAD_BYTES_PER_OWNER
  ) {
    return failure("CONFLICT", "Finish or cancel an existing upload before starting another.");
  }

  const storageKey = createStorageKey(cleanOwnerUserId, parsed.data.purpose, now);
  const intent = await prisma.uploadIntent.create({
    data: {
      ownerUserId: cleanOwnerUserId,
      storageKey,
      purpose: parsed.data.purpose,
      declaredMimeType: mimeType,
      declaredSizeBytes: BigInt(parsed.data.sizeBytes),
      visibility,
      expiresAt,
      declaredChecksumSha256: checksumSha256
    }
  });

  try {
    const upload = await createPresignedR2PutRequest({
      storageKey: intent.storageKey,
      mimeType: intent.declaredMimeType,
      sizeBytes: Number(intent.declaredSizeBytes),
      expiresInSeconds: Math.floor(UPLOAD_INTENT_TTL_MS / 1000),
      checksumSha256: intent.declaredChecksumSha256,
      access: storageAccess(intent.visibility),
      metadata: uploadIntentMetadata(intent)
    });

    return {
      ok: true as const,
      intent: publicIntentView(intent),
      uploadUrl: upload.url,
      uploadHeaders: upload.headers,
      expiresInSeconds: Math.floor(UPLOAD_INTENT_TTL_MS / 1000)
    };
  } catch (error) {
    await prisma.uploadIntent.updateMany({
      where: {
        id: intent.id,
        status: UploadIntentStatus.PENDING
      },
      data: {
        status: UploadIntentStatus.REVOKED
      }
    });
    await diagnostics.error(MODULE_KEY, "Could not create a presigned upload request.", {
      ownerUserId: cleanOwnerUserId,
      intentId: intent.id,
      purpose: intent.purpose,
      error: error instanceof Error ? error.message : "unknown"
    });

    return failure("STORAGE_UNAVAILABLE", "Media storage is not available right now.");
  }
}

async function cleanupIntentObject(intent: Pick<UploadIntent, "id" | "storageKey" | "visibility">) {
  try {
    await deleteR2Object(intent.storageKey, storageAccess(intent.visibility));
    return true;
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Upload intent object cleanup failed.", {
      intentId: intent.id,
      error: error instanceof Error ? error.message : "unknown"
    });
    return false;
  }
}

async function expirePendingIntent(
  intent: Pick<UploadIntent, "id" | "ownerUserId" | "storageKey" | "visibility">,
  now = new Date()
) {
  const expired = await prisma.uploadIntent.updateMany({
    where: {
      id: intent.id,
      ownerUserId: intent.ownerUserId,
      status: UploadIntentStatus.PENDING,
      expiresAt: { lte: now }
    },
    data: {
      status: UploadIntentStatus.EXPIRED
    }
  });

  if (expired.count === 1) {
    await cleanupIntentObject(intent);
  }

  return expired.count === 1;
}

export async function completeUploadIntent(ownerUserId: string, input: unknown) {
  const parsed = uploadIntentReferenceSchema.safeParse(input);
  const cleanOwnerUserId = ownerUserId.trim();

  if (!cleanOwnerUserId || !parsed.success) {
    return failure("INVALID_UPLOAD", parsed.success ? "A member is required." : parsed.error.issues[0]?.message ?? "Invalid upload intent.");
  }

  const intent = await prisma.uploadIntent.findUnique({
    where: { id: parsed.data.intentId }
  });

  if (!intent || intent.ownerUserId !== cleanOwnerUserId) {
    return failure("NOT_FOUND", "Upload intent was not found.");
  }

  if (intent.status === UploadIntentStatus.VERIFIED && intent.verifiedAt) {
    return { ok: true as const, intent: verifiedIntentView(intent) };
  }

  if (intent.status === UploadIntentStatus.USED) {
    return failure("ALREADY_USED", "Upload intent has already been used.");
  }

  if (intent.status === UploadIntentStatus.REVOKED) {
    return failure("REVOKED", "Upload intent has been revoked.");
  }

  if (intent.status === UploadIntentStatus.REJECTED) {
    return failure("OBJECT_REJECTED", "Uploaded file did not pass verification.");
  }

  if (intent.status === UploadIntentStatus.VERIFYING) {
    return failure("CONFLICT", "Upload verification is already in progress.");
  }

  if (intent.status === UploadIntentStatus.EXPIRED || intent.expiresAt <= new Date()) {
    await expirePendingIntent(intent);
    return failure("EXPIRED", "Upload intent has expired.");
  }

  const verificationStartedAt = new Date();
  const claimed = await prisma.uploadIntent.updateMany({
    where: {
      id: intent.id,
      ownerUserId: cleanOwnerUserId,
      status: UploadIntentStatus.PENDING,
      expiresAt: { gt: verificationStartedAt }
    },
    data: {
      status: UploadIntentStatus.VERIFYING,
      verificationError: null
    }
  });

  if (claimed.count !== 1) {
    const current = await prisma.uploadIntent.findUnique({ where: { id: intent.id } });
    if (current?.status === UploadIntentStatus.VERIFIED && current.verifiedAt) {
      return { ok: true as const, intent: verifiedIntentView(current) };
    }
    return failure("CONFLICT", "Upload intent changed while verification was starting.");
  }

  const uploadedObject = await verifyR2Object({
    storageKey: intent.storageKey,
    expectedMimeType: intent.declaredMimeType,
    expectedSizeBytes: Number(intent.declaredSizeBytes),
    expectedChecksumSha256: intent.declaredChecksumSha256,
    expectedMetadata: uploadIntentMetadata(intent),
    access: storageAccess(intent.visibility),
    label: "Uploaded file"
  });

  if (!uploadedObject.ok) {
    const rejectedAt = new Date();
    const rejected = await prisma.uploadIntent.updateMany({
      where: {
        id: intent.id,
        ownerUserId: cleanOwnerUserId,
        status: UploadIntentStatus.VERIFYING
      },
      data: {
        status: UploadIntentStatus.REJECTED,
        rejectedAt,
        verificationError: uploadedObject.error.slice(0, 500)
      }
    });

    if (rejected.count === 1) {
      await cleanupIntentObject(intent);
    }

    return failure("OBJECT_REJECTED", uploadedObject.error);
  }

  const verifiedAt = new Date();
  const verified = await prisma.uploadIntent.updateMany({
    where: {
      id: intent.id,
      ownerUserId: cleanOwnerUserId,
      storageKey: intent.storageKey,
      status: UploadIntentStatus.VERIFYING
    },
    data: {
      status: UploadIntentStatus.VERIFIED,
      completedAt: verifiedAt,
      verifiedAt,
      observedMimeType: uploadedObject.mimeType,
      observedSizeBytes: uploadedObject.sizeBytes === null ? null : BigInt(uploadedObject.sizeBytes),
      observedChecksumSha256: uploadedObject.checksumSha256,
      expiresAt: new Date(verifiedAt.getTime() + VERIFIED_CONSUMPTION_TTL_MS),
      verificationError: null
    }
  });

  if (verified.count !== 1) {
    const current = await prisma.uploadIntent.findUnique({ where: { id: intent.id } });

    if (current?.status === UploadIntentStatus.VERIFIED && current.verifiedAt) {
      return { ok: true as const, intent: verifiedIntentView(current) };
    }

    return failure(current?.status === UploadIntentStatus.EXPIRED ? "EXPIRED" : "CONFLICT", "Upload intent could not be completed.");
  }

  return {
    ok: true as const,
    intent: verifiedIntentView({
      ...intent,
      verifiedAt
    })
  };
}

export async function revokeUploadIntent(ownerUserId: string, input: unknown) {
  const parsed = uploadIntentReferenceSchema.safeParse(input);
  const cleanOwnerUserId = ownerUserId.trim();

  if (!cleanOwnerUserId || !parsed.success) {
    return failure("INVALID_UPLOAD", "Invalid upload intent.");
  }

  const intent = await prisma.uploadIntent.findUnique({ where: { id: parsed.data.intentId } });

  if (!intent || intent.ownerUserId !== cleanOwnerUserId) {
    return failure("NOT_FOUND", "Upload intent was not found.");
  }

  if (intent.status === UploadIntentStatus.USED) {
    return failure("ALREADY_USED", "A used upload intent cannot be revoked.");
  }

  const revoked = await prisma.uploadIntent.updateMany({
    where: {
      id: intent.id,
      ownerUserId: cleanOwnerUserId,
      status: { in: [UploadIntentStatus.PENDING, UploadIntentStatus.VERIFYING, UploadIntentStatus.VERIFIED] }
    },
    data: {
      status: UploadIntentStatus.REVOKED
    }
  });

  if (revoked.count === 1) {
    await cleanupIntentObject(intent);
  }

  return revoked.count === 1
    ? { ok: true as const }
    : failure(
        intent.status === UploadIntentStatus.EXPIRED
          ? "EXPIRED"
          : intent.status === UploadIntentStatus.REJECTED
            ? "OBJECT_REJECTED"
            : "REVOKED",
        "Upload intent is no longer active."
      );
}

export async function consumeVerifiedUploadIntent<T>(input: {
  ownerUserId: string;
  intentId: string;
  purpose: UploadIntentPurpose;
  consume: (transaction: Prisma.TransactionClient, intent: VerifiedUploadIntent) => Promise<T>;
}) {
  const now = new Date();
  const effectivePolicy = await getEffectivePolicyForUser(input.ownerUserId);
  if (!effectivePolicy) {
    return failure("INVALID_UPLOAD", "An active membership is required.");
  }
  const storageLimitBytes = BigInt(effectivePolicy.limits.storageLimitBytes);
  const outcome = await prisma.$transaction(async (transaction) => {
    const intent = await transaction.uploadIntent.findUnique({ where: { id: input.intentId } });

    if (!intent || intent.ownerUserId !== input.ownerUserId) {
      return { kind: "result" as const, result: failure("NOT_FOUND", "Upload intent was not found.") };
    }

    if (intent.purpose !== input.purpose) {
      return { kind: "result" as const, result: failure("PURPOSE_MISMATCH", "Upload intent purpose did not match.") };
    }

    if (intent.status === UploadIntentStatus.USED) {
      return { kind: "result" as const, result: failure("ALREADY_USED", "Upload intent has already been used.") };
    }

    if (intent.status !== UploadIntentStatus.VERIFIED || !intent.completedAt || !intent.verifiedAt) {
      return { kind: "result" as const, result: failure("NOT_VERIFIED", "Upload must be verified before it can be used.") };
    }

    if (intent.expiresAt <= now) {
      const expired = await transaction.uploadIntent.updateMany({
        where: {
          id: intent.id,
          ownerUserId: input.ownerUserId,
          status: UploadIntentStatus.VERIFIED
        },
        data: {
          status: UploadIntentStatus.EXPIRED
        }
      });

      return expired.count === 1
        ? { kind: "expired" as const, intent }
        : { kind: "result" as const, result: failure("CONFLICT", "Upload intent changed while it was being used.") };
    }

    const storedAssets = await transaction.mediaAsset.aggregate({
      where: { ownerUserId: input.ownerUserId, status: "READY" },
      _sum: { sizeBytes: true }
    });
    if ((storedAssets._sum.sizeBytes ?? BigInt(0)) + intent.declaredSizeBytes > storageLimitBytes) {
      return { kind: "result" as const, result: failure("QUOTA_EXCEEDED", "This upload would exceed your account storage limit.") };
    }

    const claimed = await transaction.uploadIntent.updateMany({
      where: {
        id: intent.id,
        ownerUserId: input.ownerUserId,
        purpose: input.purpose,
        status: UploadIntentStatus.VERIFIED,
        completedAt: { not: null },
        verifiedAt: { not: null },
        expiresAt: { gt: now }
      },
      data: {
        status: UploadIntentStatus.USED,
        usedAt: now
      }
    });

    if (claimed.count !== 1) {
      return { kind: "result" as const, result: failure("CONFLICT", "Upload intent changed while it was being used.") };
    }

    const value = await input.consume(transaction, intent as VerifiedUploadIntent);
    return {
      kind: "result" as const,
      result: {
        ok: true as const,
        value,
        intent: {
          id: intent.id,
          purpose: intent.purpose,
          verification: "VERIFIED" as const,
          usedAt: now.toISOString()
        }
      }
    };
  });

  if (outcome.kind === "expired") {
    await cleanupIntentObject(outcome.intent);
    return failure("EXPIRED", "Upload intent expired before it was used.");
  }

  return outcome.result;
}

export async function expireStaleUploadIntents(input: { now?: Date; take?: number } = {}) {
  const now = input.now ?? new Date();
  const verifyingCutoff = new Date(now.getTime() - VERIFYING_EXPIRY_GRACE_MS);
  const take = Math.min(Math.max(Math.trunc(input.take ?? 100), 1), MAX_CLEANUP_BATCH_SIZE);
  const candidates = await prisma.uploadIntent.findMany({
    where: {
      expiresAt: { lte: now },
      OR: [
        { status: UploadIntentStatus.PENDING },
        { status: UploadIntentStatus.VERIFYING, updatedAt: { lte: verifyingCutoff } }
      ]
    },
    select: {
      id: true,
      ownerUserId: true,
      storageKey: true,
      visibility: true
    },
    orderBy: {
      expiresAt: "asc"
    },
    take
  });

  let expiredCount = 0;
  let cleanedCount = 0;

  for (const intent of candidates) {
    const expired = await prisma.uploadIntent.updateMany({
      where: {
        id: intent.id,
        expiresAt: { lte: now },
        OR: [
          { status: UploadIntentStatus.PENDING },
          { status: UploadIntentStatus.VERIFYING, updatedAt: { lte: verifyingCutoff } }
        ]
      },
      data: {
        status: UploadIntentStatus.EXPIRED
      }
    });

    if (expired.count !== 1) continue;
    expiredCount += 1;
    if (await cleanupIntentObject(intent)) cleanedCount += 1;
  }

  return { expiredCount, cleanedCount };
}

export async function cleanupRejectedOrExpiredUploadIntents(input: { take?: number } = {}) {
  const take = Math.min(Math.max(Math.trunc(input.take ?? 100), 1), MAX_CLEANUP_BATCH_SIZE);
  const intents = await prisma.uploadIntent.findMany({
    where: {
      status: { in: [UploadIntentStatus.EXPIRED, UploadIntentStatus.REVOKED, UploadIntentStatus.REJECTED] }
    },
    select: {
      id: true,
      storageKey: true,
      visibility: true
    },
    orderBy: {
      updatedAt: "asc"
    },
    take
  });

  let cleanedCount = 0;
  for (const intent of intents) {
    if (!(await cleanupIntentObject(intent))) continue;

    const removed = await prisma.uploadIntent.deleteMany({
      where: {
        id: intent.id,
        status: { in: [UploadIntentStatus.EXPIRED, UploadIntentStatus.REVOKED, UploadIntentStatus.REJECTED] }
      }
    });
    if (removed.count === 1) cleanedCount += 1;
  }

  return { candidateCount: intents.length, cleanedCount };
}
