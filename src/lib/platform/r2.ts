import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readPlatformEnv } from "@/lib/platform/env";

export function getR2Client() {
  const env = readPlatformEnv();

  if (!env.CLOUDFLARE_R2_ACCOUNT_ID || !env.CLOUDFLARE_R2_ACCESS_KEY_ID || !env.CLOUDFLARE_R2_SECRET_ACCESS_KEY) {
    throw new Error("Cloudflare R2 credentials are not configured.");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
    }
  });
}

export function getR2PublicUrl(storageKey: string) {
  const env = readPlatformEnv();
  if (!env.CLOUDFLARE_R2_PUBLIC_BASE_URL) return null;
  return `${env.CLOUDFLARE_R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${storageKey.replace(/^\//, "")}`;
}

export async function createPresignedR2PutUrl(input: {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  expiresInSeconds?: number;
}) {
  const env = readPlatformEnv();

  if (!env.CLOUDFLARE_R2_BUCKET) {
    throw new Error("Cloudflare R2 bucket is not configured.");
  }

  const command = new PutObjectCommand({
    Bucket: env.CLOUDFLARE_R2_BUCKET,
    Key: input.storageKey,
    ContentType: input.mimeType,
    ContentLength: input.sizeBytes
  });

  return getSignedUrl(getR2Client(), command, {
    expiresIn: input.expiresInSeconds ?? 300
  });
}
