import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readPlatformEnv } from "@/lib/platform/env";

type R2Config = ReturnType<typeof readR2Config>;

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
    publicBaseUrl: env.CLOUDFLARE_R2_PUBLIC_BASE_URL ?? env.R2_PUBLIC_BASE_URL
  };
}

function r2ConfigCacheKey(r2: R2Config) {
  return [r2.endpoint, r2.accessKeyId, r2.secretAccessKey].join("|");
}

export function isR2Configured(r2 = readR2Config()) {
  return Boolean(r2.endpoint && r2.accessKeyId && r2.secretAccessKey && r2.bucket);
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

export async function createPresignedR2PutUrl(input: {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  expiresInSeconds?: number;
}) {
  const r2 = readR2Config();

  if (!r2.bucket) {
    throw new Error("Cloudflare R2 bucket is not configured.");
  }

  const command = new PutObjectCommand({
    Bucket: r2.bucket,
    Key: input.storageKey,
    ContentType: input.mimeType
  });

  return getSignedUrl(getR2Client(), command, {
    expiresIn: input.expiresInSeconds ?? 300
  });
}

export async function getR2Object(storageKey: string) {
  const r2 = readR2Config();

  if (!r2.bucket) {
    throw new Error("Cloudflare R2 bucket is not configured.");
  }

  return getR2Client().send(
    new GetObjectCommand({
      Bucket: r2.bucket,
      Key: storageKey
    })
  );
}

export async function headR2Object(storageKey: string) {
  const r2 = readR2Config();

  if (!r2.bucket) {
    throw new Error("Cloudflare R2 bucket is not configured.");
  }

  return getR2Client().send(
    new HeadObjectCommand({
      Bucket: r2.bucket,
      Key: storageKey
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
  label?: string;
}) {
  const label = input.label ?? "upload";
  const retryDelaysMs = [250, 750, 1500];

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      const object = await headR2Object(input.storageKey);
      const actualSize = object.ContentLength;
      const actualMimeType = normalizeContentType(object.ContentType);
      const expectedMimeType = normalizeContentType(input.expectedMimeType);

      if (typeof input.expectedSizeBytes === "number" && typeof actualSize === "number" && actualSize !== input.expectedSizeBytes) {
        return {
          ok: false as const,
          error: `${label} did not finish correctly. Expected ${input.expectedSizeBytes} bytes, found ${actualSize}.`
        };
      }

      if (expectedMimeType && actualMimeType && actualMimeType !== expectedMimeType) {
        return {
          ok: false as const,
          error: `${label} content type changed during upload.`
        };
      }

      return {
        ok: true as const,
        sizeBytes: typeof actualSize === "number" ? actualSize : null,
        mimeType: actualMimeType || null,
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

export async function deleteR2Object(storageKey: string) {
  const r2 = readR2Config();

  if (!r2.bucket) {
    throw new Error("Cloudflare R2 bucket is not configured.");
  }

  return getR2Client().send(
    new DeleteObjectCommand({
      Bucket: r2.bucket,
      Key: storageKey
    })
  );
}
