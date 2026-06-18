import { S3Client } from "@aws-sdk/client-s3";
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

