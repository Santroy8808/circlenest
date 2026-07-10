import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readPlatformEnv } from "@/lib/platform/env";

type R2Config = ReturnType<typeof readR2Config>;
export type R2ObjectAccess = "public" | "private";

type R2PutInput = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  expiresInSeconds?: number;
  checksumSha256?: string | null;
  metadata?: Record<string, string | undefined>;
  access?: R2ObjectAccess;
};

let cachedClient: { key: string; client: S3Client } | null = null;

export function readR2Config() {
  const env = readPlatformEnv();
  const accountId = env.CLOUDFLARE_R2_ACCOUNT_ID ?? env.R2_ACCOUNT_ID;
  const endpoint =
    env.CLOUDFLARE_R2_ENDPOINT ??
    env.R2_ENDPOINT ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  return {
    endpoint,
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? env.R2_SECRET_ACCESS_KEY,
    bucket: env.CLOUDFLARE_R2_BUCKET ?? env.R2_BUCKET,
    privateBucket: env.CLOUDFLARE_R2_PRIVATE_BUCKET ?? env.R2_PRIVATE_BUCKET,
    publicBaseUrl: env.CLOUDFLARE_R2_PUBLIC_BASE_URL ?? env.R2_PUBLIC_BASE_URL
  };
}

function r2ConfigCacheKey(r2: R2Config) {
  return [r2.endpoint, r2.accessKeyId, r2.secretAccessKey].join("|");
}

export function isR2Configured(r2 = readR2Config()) {
  return Boolean(r2.endpoint && r2.accessKeyId && r2.secretAccessKey && r2.bucket);
}

export function isPrivateR2Configured(r2 = readR2Config()) {
  return Boolean(r2.endpoint && r2.accessKeyId && r2.secretAccessKey && r2.privateBucket);
}

function bucketForAccess(r2: R2Config, access: R2ObjectAccess) {
  const bucket = access === "private" ? r2.privateBucket : r2.bucket;
  if (!bucket) {
    throw new Error(access === "private" ? "Cloudflare private R2 bucket is not configured." : "Cloudflare R2 bucket is not configured.");
  }
  return bucket;
}

export function getR2Client() {
  const r2 = readR2Config();

  if (!r2.endpoint || !r2.accessKeyId || !r2.secretAccessKey) {
    throw new Error("Cloudflare R2 credentials are not configured.");
  }

  const key = r2ConfigCacheKey(r2);
  if (cachedClient?.key === key) {
    return cachedClient.client;
  }

  cachedClient = {
    key,
    client: new S3Client({
      region: "auto",
      endpoint: r2.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey
      }
    })
  };

  return cachedClient.client;
}

export function getR2PublicUrl(storageKey: string) {
  const r2 = readR2Config();
  if (!r2.publicBaseUrl) return null;
  return `${r2.publicBaseUrl.replace(/\/$/, "")}/${storageKey.replace(/^\//, "")}`;
}

export function normalizeSha256Checksum(value?: string | null) {
  if (!value?.trim()) return null;

  const withoutPrefix = value.trim().replace(/^sha256(?:-|:|=)/i, "");

  if (/^[a-f0-9]{64}$/i.test(withoutPrefix)) {
    return withoutPrefix.toLowerCase();
  }

  const base64 = withoutPrefix.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[a-z0-9+/]+={0,2}$/i.test(base64)) {
    throw new Error("SHA-256 checksum must be 64 hex characters or a 32-byte base64 value.");
  }

  const bytes = Buffer.from(base64, "base64");
  const canonicalBase64 = bytes.toString("base64").replace(/=+$/, "");
  if (bytes.length !== 32 || canonicalBase64 !== base64.replace(/=+$/, "")) {
    throw new Error("SHA-256 checksum must be 64 hex characters or a 32-byte base64 value.");
  }

  return bytes.toString("hex");
}

function sha256HexToBase64(value: string) {
  return Buffer.from(value, "hex").toString("base64");
}

function normalizeR2Metadata(metadata?: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(metadata ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()])
      .filter(([key, value]) => Boolean(key && value))
  );
}

export async function createPresignedR2PutRequest(input: R2PutInput) {
  const r2 = readR2Config();
  const bucket = bucketForAccess(r2, input.access ?? "public");

  const checksumSha256 = normalizeSha256Checksum(input.checksumSha256);
  const checksumBase64 = checksumSha256 ? sha256HexToBase64(checksumSha256) : undefined;
  const metadata = normalizeR2Metadata(input.metadata);
  const xAmzUploadHeaders = new Set<string>([
    ...(checksumBase64 ? ["x-amz-checksum-sha256"] : []),
    ...Object.keys(metadata).map((key) => `x-amz-meta-${key}`)
  ]);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.storageKey,
    ContentType: input.mimeType,
    ContentLength: input.sizeBytes,
    ChecksumSHA256: checksumBase64,
    Metadata: Object.keys(metadata).length > 0 ? metadata : undefined
  });

  const url = await getSignedUrl(getR2Client(), command, {
    expiresIn: input.expiresInSeconds ?? 300,
    unhoistableHeaders: xAmzUploadHeaders
  });

  return {
    url,
    headers: {
      "content-type": input.mimeType,
      ...(checksumBase64 ? { "x-amz-checksum-sha256": checksumBase64 } : {}),
      ...Object.fromEntries(Object.entries(metadata).map(([key, value]) => [`x-amz-meta-${key}`, value]))
    }
  };
}

export async function createPresignedR2PutUrl(input: R2PutInput) {
  const request = await createPresignedR2PutRequest(input);
  return request.url;
}

export async function getR2Object(storageKey: string, access: R2ObjectAccess = "public") {
  const r2 = readR2Config();
  const bucket = bucketForAccess(r2, access);

  return getR2Client().send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey
    })
  );
}

function encodeCopySource(bucket: string, storageKey: string) {
  const encodedBucket = encodeURIComponent(bucket);
  const encodedKey = storageKey
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${encodedBucket}/${encodedKey}`;
}

export async function copyR2Object(storageKey: string, fromAccess: R2ObjectAccess, toAccess: R2ObjectAccess) {
  const r2 = readR2Config();
  const sourceBucket = bucketForAccess(r2, fromAccess);
  const targetBucket = bucketForAccess(r2, toAccess);

  return getR2Client().send(
    new CopyObjectCommand({
      Bucket: targetBucket,
      CopySource: encodeCopySource(sourceBucket, storageKey),
      Key: storageKey,
      MetadataDirective: "COPY"
    })
  );
}

export async function headR2Object(storageKey: string, access: R2ObjectAccess = "public") {
  const r2 = readR2Config();
  const bucket = bucketForAccess(r2, access);

  return getR2Client().send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ChecksumMode: "ENABLED"
    })
  );
}

function normalizeContentType(value?: string | null) {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function verifyR2Object(input: {
  storageKey: string;
  expectedSizeBytes?: number;
  expectedMimeType?: string;
  expectedChecksumSha256?: string | null;
  expectedMetadata?: Record<string, string>;
  access?: R2ObjectAccess;
  label?: string;
}) {
  const label = input.label ?? "upload";
  const retryDelaysMs = [250, 750, 1500];

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      const object = await headR2Object(input.storageKey, input.access);
      const actualSize = object.ContentLength;
      const actualMimeType = normalizeContentType(object.ContentType);
      const expectedMimeType = normalizeContentType(input.expectedMimeType);
      const expectedChecksumSha256 = normalizeSha256Checksum(input.expectedChecksumSha256);
      const actualChecksumSha256 = normalizeSha256Checksum(object.ChecksumSHA256);
      const actualMetadata = normalizeR2Metadata(object.Metadata);

      if (typeof input.expectedSizeBytes === "number" && actualSize !== input.expectedSizeBytes) {
        return {
          ok: false as const,
          error: `${label} did not finish correctly. Expected ${input.expectedSizeBytes} bytes, found ${actualSize}.`
        };
      }

      if (expectedMimeType && actualMimeType !== expectedMimeType) {
        return {
          ok: false as const,
          error: `${label} content type changed during upload.`
        };
      }

      if (expectedChecksumSha256 && actualChecksumSha256 !== expectedChecksumSha256) {
        return {
          ok: false as const,
          error: actualChecksumSha256
            ? `${label} checksum did not match the declared SHA-256 value.`
            : `${label} checksum could not be verified by media storage.`
        };
      }

      for (const [key, expectedValue] of Object.entries(normalizeR2Metadata(input.expectedMetadata))) {
        if (actualMetadata[key] !== expectedValue) {
          return {
            ok: false as const,
            error: `${label} metadata did not match its upload intent.`
          };
        }
      }

      return {
        ok: true as const,
        sizeBytes: typeof actualSize === "number" ? actualSize : null,
        mimeType: actualMimeType || null,
        checksumSha256: actualChecksumSha256,
        metadata: actualMetadata,
        eTag: object.ETag ?? null
      };
    } catch {
      const retryDelayMs = retryDelaysMs[attempt];

      if (typeof retryDelayMs === "number") {
        await delay(retryDelayMs);
        continue;
      }

      return {
        ok: false as const,
        error: `${label} was not found in media storage. Try uploading it again.`
      };
    }
  }

  return {
    ok: false as const,
    error: `${label} was not found in media storage. Try uploading it again.`
  };
}

export async function deleteR2Object(storageKey: string, access: R2ObjectAccess = "public") {
  const r2 = readR2Config();
  const bucket = bucketForAccess(r2, access);

  return getR2Client().send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: storageKey
    })
  );
}
