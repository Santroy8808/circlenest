import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readPlatformEnv } from "@/lib/platform/env";

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

export function getR2Client() {
  const r2 = readR2Config();

  if (!r2.endpoint || !r2.accessKeyId || !r2.secretAccessKey) {
    throw new Error("Cloudflare R2 credentials are not configured.");
  }

  return new S3Client({
    region: "auto",
    endpoint: r2.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey
    }
  });
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
    ContentType: input.mimeType,
    ContentLength: input.sizeBytes
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
