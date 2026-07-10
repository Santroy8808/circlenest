import { createHmac, randomBytes } from "node:crypto";
import { readPlatformEnv } from "@/lib/platform/env";

const developmentSignalSecret = randomBytes(32);
let cachedSignalKey: Buffer | null = null;

function signalKey() {
  if (cachedSignalKey) return cachedSignalKey;
  const configuredSecret = readPlatformEnv().IP_HASH_SECRET;
  cachedSignalKey = configuredSecret ? Buffer.from(configuredSecret, "utf8") : developmentSignalSecret;
  return cachedSignalKey;
}

export function hashPrivateSignal(value: string | null | undefined, domain: string) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return createHmac("sha256", signalKey()).update(`${domain}:${normalized}`, "utf8").digest("hex");
}
