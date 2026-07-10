import "./load-next-env";

import { createHash } from "node:crypto";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
  type HeadObjectCommandOutput
} from "@aws-sdk/client-s3";
import { MediaAssetStatus, MediaVisibility, Prisma, PrismaClient } from "@prisma/client";

type MigrationMode = "scan" | "copy-assets" | "convert-resumes" | "purge-public";

type R2MigrationConfig = {
  client: S3Client;
  publicBucket: string;
  privateBucket: string;
  publicBaseUrl: URL | null;
};

type ObjectDescriptor = {
  mimeType: string;
  sizeBytes: number;
};

type MigrationStats = {
  scanned: number;
  eligible: number;
  copied: number;
  alreadyPrivate: number;
  databaseUpdated: number;
  publicDeleted: number;
  alreadyPurged: number;
  skipped: number;
  failed: number;
};

const VALID_MODES = new Set<MigrationMode>(["scan", "copy-assets", "convert-resumes", "purge-public"]);
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;
const LOCAL_CONFIRMATION = "PRIVATE_MEDIA_LOCAL_MUTATION";
const PRODUCTION_CONFIRMATION = "PRIVATE_MEDIA_PRODUCTION_MUTATION";
const PURGE_CONFIRMATION = "DELETE_VERIFIED_PUBLIC_COPIES";
const RESTRICTED_VISIBILITIES = [MediaVisibility.PRIVATE, MediaVisibility.MEMBERS] as const;
const RESUME_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

const prisma = new PrismaClient();

class MigrationSafetyError extends Error {
  constructor(code: string) {
    super(code);
    this.name = code;
  }
}

function stop(code: string): never {
  throw new MigrationSafetyError(code);
}

function readOption(name: string) {
  const equalsPrefix = `--${name}=`;
  const equalsValue = process.argv.find((argument) => argument.startsWith(equalsPrefix));
  if (equalsValue) return equalsValue.slice(equalsPrefix.length);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function parseMode(): MigrationMode {
  const value = (readOption("mode") ?? "scan") as MigrationMode;
  if (!VALID_MODES.has(value)) {
    stop("MODE_INVALID");
  }
  return value;
}

function parseBatchSize() {
  const raw = Number(readOption("batch-size") ?? DEFAULT_BATCH_SIZE);
  if (!Number.isInteger(raw) || raw < 1 || raw > MAX_BATCH_SIZE) {
    stop("BATCH_SIZE_INVALID");
  }
  return raw;
}

function requiredEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  stop("R2_CONFIGURATION_MISSING");
}

function optionalEnvironmentValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function readR2MigrationConfig(): R2MigrationConfig {
  const accountId = optionalEnvironmentValue("CLOUDFLARE_R2_ACCOUNT_ID", "R2_ACCOUNT_ID");
  const endpoint =
    optionalEnvironmentValue("CLOUDFLARE_R2_ENDPOINT", "R2_ENDPOINT") ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const accessKeyId = requiredEnvironmentValue("CLOUDFLARE_R2_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnvironmentValue("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY");
  const publicBucket = requiredEnvironmentValue("CLOUDFLARE_R2_BUCKET", "R2_BUCKET");
  const privateBucket = requiredEnvironmentValue("CLOUDFLARE_R2_PRIVATE_BUCKET", "R2_PRIVATE_BUCKET");

  if (!endpoint) stop("R2_ENDPOINT_MISSING");
  if (publicBucket.toLowerCase() === privateBucket.toLowerCase()) {
    stop("R2_BUCKETS_NOT_DISTINCT");
  }

  const publicBaseValue = optionalEnvironmentValue("CLOUDFLARE_R2_PUBLIC_BASE_URL", "R2_PUBLIC_BASE_URL");
  let publicBaseUrl: URL | null = null;
  if (publicBaseValue) {
    publicBaseUrl = new URL(publicBaseValue.endsWith("/") ? publicBaseValue : `${publicBaseValue}/`);
    if (!/^https?:$/.test(publicBaseUrl.protocol) || publicBaseUrl.username || publicBaseUrl.password) {
      stop("R2_PUBLIC_BASE_URL_INVALID");
    }
  }

  return {
    client: new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey }
    }),
    publicBucket,
    privateBucket,
    publicBaseUrl
  };
}

function assertMutationGuard(mode: MigrationMode, apply: boolean) {
  if (!apply) return;
  if (mode === "scan") stop("SCAN_MODE_IS_READ_ONLY");

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) stop("DATABASE_URL_MISSING");

  let hostname: string;
  try {
    hostname = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    stop("DATABASE_URL_GUARD_INVALID");
  }

  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const isProductionRuntime = process.env.NODE_ENV?.trim().toLowerCase() === "production";
  if (isProductionRuntime || !isLocal) {
    if (readOption("confirm-production") !== PRODUCTION_CONFIRMATION) {
      stop("PRODUCTION_CONFIRMATION_REQUIRED");
    }
  } else {
    if (readOption("confirm-local") !== LOCAL_CONFIRMATION) {
      stop("LOCAL_CONFIRMATION_REQUIRED");
    }
  }

  if (mode === "purge-public" && readOption("confirm-purge-public") !== PURGE_CONFIRMATION) {
    stop("PUBLIC_PURGE_CONFIRMATION_REQUIRED");
  }
}

function newStats(): MigrationStats {
  return {
    scanned: 0,
    eligible: 0,
    copied: 0,
    alreadyPrivate: 0,
    databaseUpdated: 0,
    publicDeleted: 0,
    alreadyPurged: 0,
    skipped: 0,
    failed: 0
  };
}

function opaqueRecordId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function safeErrorCode(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { name?: unknown; Code?: unknown; code?: unknown; $metadata?: { httpStatusCode?: unknown } };
    if (typeof candidate.Code === "string") return candidate.Code.slice(0, 80);
    if (typeof candidate.code === "string") return candidate.code.slice(0, 80);
    if (typeof candidate.name === "string") return candidate.name.slice(0, 80);
    if (typeof candidate.$metadata?.httpStatusCode === "number") return `HTTP_${candidate.$metadata.httpStatusCode}`;
  }
  return "UNKNOWN_ERROR";
}

function isNotFound(error: unknown) {
  const code = safeErrorCode(error).toLowerCase();
  if (code === "nosuchkey" || code === "notfound" || code === "http_404") return true;
  return Boolean(
    error &&
      typeof error === "object" &&
      "$metadata" in error &&
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
  );
}

function normalizeMimeType(value?: string | null) {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function validateStorageKey(value: string) {
  const key = value.trim().replace(/^\/+/, "");
  if (!key || key.length > 1024 || key.includes("\\") || key.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Storage key is invalid.");
  }
  return key;
}

function descriptorFromHead(head: HeadObjectCommandOutput): ObjectDescriptor {
  const sizeBytes = head.ContentLength;
  const mimeType = normalizeMimeType(head.ContentType);
  if (typeof sizeBytes !== "number" || sizeBytes < 0 || !mimeType) {
    throw new Error("Object metadata is incomplete.");
  }
  return { sizeBytes, mimeType };
}

async function headObject(config: R2MigrationConfig, bucket: string, storageKey: string) {
  try {
    return await config.client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ChecksumMode: "ENABLED"
      })
    );
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function assertMatchingDescriptor(actual: ObjectDescriptor, expected: ObjectDescriptor) {
  if (actual.sizeBytes !== expected.sizeBytes || actual.mimeType !== expected.mimeType) {
    throw new Error("Object size or content type did not match.");
  }
}

function copySource(publicBucket: string, storageKey: string) {
  return [publicBucket, ...storageKey.split("/")].map(encodeURIComponent).join("/");
}

async function ensurePrivateObject(input: {
  config: R2MigrationConfig;
  storageKey: string;
  expected?: ObjectDescriptor;
  apply: boolean;
  allowDestinationOnly?: boolean;
}) {
  const storageKey = validateStorageKey(input.storageKey);
  const [sourceHead, destinationHead] = await Promise.all([
    headObject(input.config, input.config.publicBucket, storageKey),
    headObject(input.config, input.config.privateBucket, storageKey)
  ]);
  const source = sourceHead ? descriptorFromHead(sourceHead) : null;
  const destination = destinationHead ? descriptorFromHead(destinationHead) : null;

  if (source && input.expected) assertMatchingDescriptor(source, input.expected);
  if (destination && input.expected) assertMatchingDescriptor(destination, input.expected);
  if (source && destination) assertMatchingDescriptor(destination, source);

  if (destination) {
    if (!source && !input.expected && !input.allowDestinationOnly) {
      throw new Error("Destination could not be verified against a source object.");
    }
    return { ready: true as const, copied: false as const, descriptor: destination };
  }

  if (!source) throw new Error("Source object was not found.");
  if (!input.apply) {
    return { ready: false as const, copied: false as const, descriptor: source };
  }

  await input.config.client.send(
    new CopyObjectCommand({
      Bucket: input.config.privateBucket,
      Key: storageKey,
      CopySource: copySource(input.config.publicBucket, storageKey),
      MetadataDirective: "COPY"
    })
  );
  const verifiedHead = await headObject(input.config, input.config.privateBucket, storageKey);
  if (!verifiedHead) throw new Error("Copied object was not found in the private bucket.");
  const verified = descriptorFromHead(verifiedHead);
  assertMatchingDescriptor(verified, source);
  return { ready: true as const, copied: true as const, descriptor: verified };
}

function readMetadata(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Prisma.JsonObject;
}

function readThumbnailStorageKey(value: Prisma.JsonValue | null) {
  const metadata = readMetadata(value);
  return typeof metadata?.thumbnailStorageKey === "string" ? validateStorageKey(metadata.thumbnailStorageKey) : null;
}

function hasThumbnailPublicUrl(value: Prisma.JsonValue | null) {
  const metadata = readMetadata(value);
  return typeof metadata?.thumbnailUrl === "string" && metadata.thumbnailUrl.trim().length > 0;
}

function withoutThumbnailPublicUrl(value: Prisma.JsonValue | null) {
  const metadata = readMetadata(value);
  if (!metadata || !("thumbnailUrl" in metadata)) return null;
  const next: Prisma.JsonObject = { ...metadata };
  delete next.thumbnailUrl;
  return next;
}

async function hardenRestrictedAssetRecord(assetId: string, expectedStorageKey: string) {
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.mediaAsset.findUnique({
      where: { id: assetId },
      select: { id: true, storageKey: true, publicUrl: true, visibility: true, metadata: true, updatedAt: true }
    });
    if (!current || current.storageKey !== expectedStorageKey || !RESTRICTED_VISIBILITIES.includes(current.visibility as (typeof RESTRICTED_VISIBILITIES)[number])) {
      throw new Error("Restricted media reference changed during migration.");
    }

    const metadata = withoutThumbnailPublicUrl(current.metadata);
    const needsAssetUpdate = current.publicUrl !== null || metadata !== null;
    if (needsAssetUpdate) {
      const updated = await transaction.mediaAsset.updateMany({
        where: {
          id: current.id,
          storageKey: expectedStorageKey,
          visibility: { in: [...RESTRICTED_VISIBILITIES] },
          updatedAt: current.updatedAt
        },
        data: {
          publicUrl: null,
          ...(metadata ? { metadata } : {})
        }
      });
      if (updated.count !== 1) throw new Error("Restricted media reference changed during migration.");
    }

    const [chatAttachments, mailAttachments] = await Promise.all([
      transaction.chatAttachment.updateMany({
        where: { mediaAssetId: current.id, publicUrl: { not: null } },
        data: { publicUrl: null }
      }),
      transaction.mailAttachment.updateMany({
        where: { mediaAssetId: current.id, publicUrl: { not: null } },
        data: { publicUrl: null }
      })
    ]);

    return needsAssetUpdate || chatAttachments.count > 0 || mailAttachments.count > 0;
  });
}

async function runAssetCopy(config: R2MigrationConfig, batchSize: number, apply: boolean) {
  const stats = newStats();
  let cursor: string | undefined;

  for (;;) {
    const assets = await prisma.mediaAsset.findMany({
      where: { visibility: { in: [...RESTRICTED_VISIBILITIES] } },
      select: {
        id: true,
        storageKey: true,
        publicUrl: true,
        mimeType: true,
        sizeBytes: true,
        metadata: true
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    if (assets.length === 0) break;

    for (const asset of assets) {
      stats.scanned += 1;
      try {
        const storageKey = validateStorageKey(asset.storageKey);
        const thumbnailStorageKey = readThumbnailStorageKey(asset.metadata);
        const alreadyHardened = asset.publicUrl === null && !hasThumbnailPublicUrl(asset.metadata);
        const objects = [
          {
            storageKey,
            expected: { sizeBytes: Number(asset.sizeBytes), mimeType: normalizeMimeType(asset.mimeType) },
            allowDestinationOnly: alreadyHardened
          },
          ...(thumbnailStorageKey
            ? [{ storageKey: thumbnailStorageKey, expected: undefined, allowDestinationOnly: alreadyHardened }]
            : [])
        ];
        stats.eligible += 1;
        let ready = true;
        for (const object of objects) {
          const result = await ensurePrivateObject({ config, ...object, apply });
          if (!result.ready) ready = false;
          if (result.copied) stats.copied += 1;
          else if (result.ready) stats.alreadyPrivate += 1;
        }

        if (!apply) continue;
        if (!ready) throw new Error("Private copy was not verified.");
        if (await hardenRestrictedAssetRecord(asset.id, storageKey)) stats.databaseUpdated += 1;
      } catch (error) {
        stats.failed += 1;
        console.error(`[private-media] asset=${opaqueRecordId(asset.id)} failed code=${safeErrorCode(error)}`);
      }
    }

    cursor = assets.at(-1)?.id;
  }

  return stats;
}

function storageKeyFromLegacyPublicUrl(value: string, publicBaseUrl: URL | null) {
  if (value.startsWith("/api/media/assets/")) return { kind: "internal" as const };
  if (!publicBaseUrl) return { kind: "unsupported" as const };

  let candidate: URL;
  try {
    candidate = new URL(value);
  } catch {
    return { kind: "unsupported" as const };
  }
  if (candidate.origin !== publicBaseUrl.origin || candidate.username || candidate.password) {
    return { kind: "unsupported" as const };
  }

  const basePath = publicBaseUrl.pathname.endsWith("/") ? publicBaseUrl.pathname : `${publicBaseUrl.pathname}/`;
  if (!candidate.pathname.startsWith(basePath)) return { kind: "unsupported" as const };
  try {
    const storageKey = validateStorageKey(decodeURIComponent(candidate.pathname.slice(basePath.length)));
    return { kind: "storage-key" as const, storageKey };
  } catch {
    return { kind: "unsupported" as const };
  }
}

async function persistResumeMigration(input: {
  resume: { id: string; userId: string; uploadedResumeUrl: string; uploadedResumeName: string | null };
  storageKey: string;
  descriptor: ObjectDescriptor;
}) {
  return prisma.$transaction(async (transaction) => {
    let asset = await transaction.mediaAsset.findUnique({ where: { storageKey: input.storageKey } });
    if (asset && (asset.ownerUserId !== input.resume.userId || asset.visibility !== MediaVisibility.PRIVATE)) {
      throw new Error("Existing media ownership or visibility did not match the resume owner.");
    }

    if (!asset) {
      asset = await transaction.mediaAsset.create({
        data: {
          ownerUserId: input.resume.userId,
          storageKey: input.storageKey,
          publicUrl: null,
          mimeType: input.descriptor.mimeType,
          sizeBytes: BigInt(input.descriptor.sizeBytes),
          originalName: input.resume.uploadedResumeName?.slice(0, 240) || null,
          status: MediaAssetStatus.READY,
          visibility: MediaVisibility.PRIVATE,
          metadata: { migrationSource: "legacy-user-resume" }
        }
      });
    } else {
      const metadata = withoutThumbnailPublicUrl(asset.metadata);
      asset = await transaction.mediaAsset.update({
        where: { id: asset.id },
        data: {
          publicUrl: null,
          ...(metadata ? { metadata } : {})
        }
      });
    }

    await Promise.all([
      transaction.chatAttachment.updateMany({
        where: { mediaAssetId: asset.id, publicUrl: { not: null } },
        data: { publicUrl: null }
      }),
      transaction.mailAttachment.updateMany({
        where: { mediaAssetId: asset.id, publicUrl: { not: null } },
        data: { publicUrl: null }
      })
    ]);

    const updated = await transaction.userResume.updateMany({
      where: {
        id: input.resume.id,
        userId: input.resume.userId,
        uploadedResumeUrl: input.resume.uploadedResumeUrl
      },
      data: {
        uploadedResumeUrl: `/api/media/assets/${encodeURIComponent(asset.id)}`
      }
    });
    if (updated.count !== 1) throw new Error("Resume reference changed during migration.");
    return asset.id;
  });
}

async function runResumeConversion(config: R2MigrationConfig, batchSize: number, apply: boolean) {
  if (!config.publicBaseUrl) throw new Error("R2 public base URL is required for resume conversion.");
  const stats = newStats();
  let cursor: string | undefined;

  for (;;) {
    const resumes = await prisma.userResume.findMany({
      where: { uploadedResumeUrl: { not: null } },
      select: { id: true, userId: true, uploadedResumeUrl: true, uploadedResumeName: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    if (resumes.length === 0) break;

    for (const resume of resumes) {
      stats.scanned += 1;
      if (!resume.uploadedResumeUrl) continue;
      const parsed = storageKeyFromLegacyPublicUrl(resume.uploadedResumeUrl, config.publicBaseUrl);
      if (parsed.kind === "internal") {
        stats.skipped += 1;
        continue;
      }
      if (parsed.kind !== "storage-key") {
        stats.skipped += 1;
        continue;
      }

      stats.eligible += 1;
      try {
        const existing = await prisma.mediaAsset.findUnique({ where: { storageKey: parsed.storageKey } });
        if (existing && (existing.ownerUserId !== resume.userId || existing.visibility !== MediaVisibility.PRIVATE)) {
          throw new Error("Existing media ownership or visibility did not match the resume owner.");
        }
        const expected = existing
          ? { sizeBytes: Number(existing.sizeBytes), mimeType: normalizeMimeType(existing.mimeType) }
          : undefined;
        const copied = await ensurePrivateObject({
          config,
          storageKey: parsed.storageKey,
          expected,
          apply,
          allowDestinationOnly: Boolean(existing?.publicUrl === null)
        });
        if (!RESUME_MIME_TYPES.has(copied.descriptor.mimeType)) {
          throw new Error("Resume content type is not allowed.");
        }
        if (copied.copied) stats.copied += 1;
        else if (copied.ready) stats.alreadyPrivate += 1;

        if (!apply) continue;
        if (!copied.ready) throw new Error("Private resume copy was not verified.");
        await persistResumeMigration({
          resume: {
            id: resume.id,
            userId: resume.userId,
            uploadedResumeUrl: resume.uploadedResumeUrl,
            uploadedResumeName: resume.uploadedResumeName
          },
          storageKey: parsed.storageKey,
          descriptor: copied.descriptor
        });
        stats.databaseUpdated += 1;
      } catch (error) {
        stats.failed += 1;
        console.error(`[private-media] resume=${opaqueRecordId(resume.id)} failed code=${safeErrorCode(error)}`);
      }
    }

    cursor = resumes.at(-1)?.id;
  }

  return stats;
}

async function proveAuthenticatedReference(asset: {
  id: string;
  storageKey: string;
  publicUrl: string | null;
  visibility: MediaVisibility;
  metadata: Prisma.JsonValue | null;
}) {
  if (!RESTRICTED_VISIBILITIES.includes(asset.visibility as (typeof RESTRICTED_VISIBILITIES)[number])) return false;
  if (asset.publicUrl !== null || hasThumbnailPublicUrl(asset.metadata)) return false;

  const [chatLeaks, mailLeaks] = await Promise.all([
    prisma.chatAttachment.count({ where: { mediaAssetId: asset.id, publicUrl: { not: null } } }),
    prisma.mailAttachment.count({ where: { mediaAssetId: asset.id, publicUrl: { not: null } } })
  ]);
  return chatLeaks === 0 && mailLeaks === 0;
}

async function hasConflictingReference(assetId: string, storageKey: string) {
  const [otherMain, otherThumbnail, chatOther, mailOther] = await Promise.all([
    prisma.mediaAsset.count({ where: { id: { not: assetId }, storageKey } }),
    prisma.mediaAsset.count({
      where: {
        id: { not: assetId },
        metadata: { path: ["thumbnailStorageKey"], equals: storageKey }
      }
    }),
    prisma.chatAttachment.count({
      where: { storageKey, OR: [{ mediaAssetId: null }, { mediaAssetId: { not: assetId } }] }
    }),
    prisma.mailAttachment.count({
      where: { storageKey, OR: [{ mediaAssetId: null }, { mediaAssetId: { not: assetId } }] }
    })
  ]);
  return otherMain > 0 || otherThumbnail > 0 || chatOther > 0 || mailOther > 0;
}

async function assertAuthenticatedReferenceForKey(assetId: string, storageKey: string) {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
    select: { id: true, storageKey: true, publicUrl: true, visibility: true, metadata: true }
  });
  if (!asset || !(await proveAuthenticatedReference(asset))) {
    throw new Error("Authenticated media reference was not proven.");
  }

  const thumbnailStorageKey = readThumbnailStorageKey(asset.metadata);
  if (asset.storageKey !== storageKey && thumbnailStorageKey !== storageKey) {
    throw new Error("Storage key is not attached to the authenticated media reference.");
  }
  if (await hasConflictingReference(asset.id, storageKey)) {
    throw new Error("Storage key has another database reference.");
  }
}

async function purgeVerifiedPublicObject(input: {
  config: R2MigrationConfig;
  assetId: string;
  storageKey: string;
  expected?: ObjectDescriptor;
  apply: boolean;
}) {
  const storageKey = validateStorageKey(input.storageKey);
  await assertAuthenticatedReferenceForKey(input.assetId, storageKey);

  const [sourceHead, destinationHead] = await Promise.all([
    headObject(input.config, input.config.publicBucket, storageKey),
    headObject(input.config, input.config.privateBucket, storageKey)
  ]);
  if (!sourceHead) return { deleted: false as const, alreadyMissing: true as const };
  if (!destinationHead) throw new Error("Private destination object was not found.");
  const source = descriptorFromHead(sourceHead);
  const destination = descriptorFromHead(destinationHead);
  assertMatchingDescriptor(destination, source);
  if (input.expected) assertMatchingDescriptor(destination, input.expected);

  if (!input.apply) return { deleted: false as const, alreadyMissing: false as const };
  await assertAuthenticatedReferenceForKey(input.assetId, storageKey);
  await input.config.client.send(
    new DeleteObjectCommand({ Bucket: input.config.publicBucket, Key: storageKey })
  );
  const remaining = await headObject(input.config, input.config.publicBucket, storageKey);
  if (remaining) throw new Error("Public source object still exists after deletion.");
  return { deleted: true as const, alreadyMissing: false as const };
}

async function runPublicPurge(config: R2MigrationConfig, batchSize: number, apply: boolean) {
  const stats = newStats();
  let cursor: string | undefined;

  for (;;) {
    const assets = await prisma.mediaAsset.findMany({
      where: { visibility: { in: [...RESTRICTED_VISIBILITIES] } },
      select: {
        id: true,
        storageKey: true,
        publicUrl: true,
        visibility: true,
        mimeType: true,
        sizeBytes: true,
        metadata: true
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    if (assets.length === 0) break;

    for (const asset of assets) {
      stats.scanned += 1;
      try {
        if (!(await proveAuthenticatedReference(asset))) {
          stats.skipped += 1;
          continue;
        }
        stats.eligible += 1;
        const thumbnailStorageKey = readThumbnailStorageKey(asset.metadata);
        const objects = [
          {
            storageKey: asset.storageKey,
            expected: { sizeBytes: Number(asset.sizeBytes), mimeType: normalizeMimeType(asset.mimeType) }
          },
          ...(thumbnailStorageKey ? [{ storageKey: thumbnailStorageKey, expected: undefined }] : [])
        ];

        for (const object of objects) {
          const result = await purgeVerifiedPublicObject({
            config,
            assetId: asset.id,
            storageKey: object.storageKey,
            expected: object.expected,
            apply
          });
          if (result.deleted) stats.publicDeleted += 1;
          if (result.alreadyMissing) stats.alreadyPurged += 1;
        }
      } catch (error) {
        stats.failed += 1;
        console.error(`[private-media] purge-asset=${opaqueRecordId(asset.id)} failed code=${safeErrorCode(error)}`);
      }
    }

    cursor = assets.at(-1)?.id;
  }

  return stats;
}

async function runScan() {
  const [restrictedAssets, restrictedPublicUrls, chatLeaks, mailLeaks, legacyResumes] = await Promise.all([
    prisma.mediaAsset.count({ where: { visibility: { in: [...RESTRICTED_VISIBILITIES] } } }),
    prisma.mediaAsset.count({
      where: { visibility: { in: [...RESTRICTED_VISIBILITIES] }, publicUrl: { not: null } }
    }),
    prisma.chatAttachment.count({
      where: { publicUrl: { not: null }, mediaAsset: { is: { visibility: { in: [...RESTRICTED_VISIBILITIES] } } } }
    }),
    prisma.mailAttachment.count({
      where: { publicUrl: { not: null }, mediaAsset: { is: { visibility: { in: [...RESTRICTED_VISIBILITIES] } } } }
    }),
    prisma.userResume.count({ where: { uploadedResumeUrl: { not: null } } })
  ]);

  console.info(`[private-media] restricted-assets=${restrictedAssets}`);
  console.info(`[private-media] restricted-assets-with-public-url=${restrictedPublicUrls}`);
  console.info(`[private-media] restricted-chat-public-url-leaks=${chatLeaks}`);
  console.info(`[private-media] restricted-mail-public-url-leaks=${mailLeaks}`);
  console.info(`[private-media] resume-references-to-review=${legacyResumes}`);
}

function printStats(stats: MigrationStats) {
  console.info(`[private-media] scanned=${stats.scanned}`);
  console.info(`[private-media] eligible=${stats.eligible}`);
  console.info(`[private-media] copied=${stats.copied}`);
  console.info(`[private-media] already-private=${stats.alreadyPrivate}`);
  console.info(`[private-media] database-updated=${stats.databaseUpdated}`);
  console.info(`[private-media] public-deleted=${stats.publicDeleted}`);
  console.info(`[private-media] already-purged=${stats.alreadyPurged}`);
  console.info(`[private-media] skipped=${stats.skipped}`);
  console.info(`[private-media] failed=${stats.failed}`);
}

async function main() {
  const mode = parseMode();
  const batchSize = parseBatchSize();
  const apply = hasFlag("apply");
  assertMutationGuard(mode, apply);
  const config = readR2MigrationConfig();

  console.info(`[private-media] mode=${mode}`);
  console.info(`[private-media] execution=${apply ? "apply" : "dry-run"}`);
  console.info(`[private-media] batch-size=${batchSize}`);

  if (mode === "scan") {
    await runScan();
    return;
  }

  const stats =
    mode === "copy-assets"
      ? await runAssetCopy(config, batchSize, apply)
      : mode === "convert-resumes"
        ? await runResumeConversion(config, batchSize, apply)
        : await runPublicPurge(config, batchSize, apply);
  printStats(stats);
  if (stats.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`[private-media] failed code=${safeErrorCode(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
