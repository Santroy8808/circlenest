import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MIN_MOBILE_AUTH_SECRET_BYTES = 32;

function configuredMobileAuthSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.MOBILE_AUTH_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_MOBILE_AUTH_SECRET_BYTES) {
    return null;
  }

  return secret;
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifyMobileAuthSecret(candidate: string | null | undefined, env: NodeJS.ProcessEnv = process.env) {
  const expected = configuredMobileAuthSecret(env);

  if (!expected || !candidate) {
    return false;
  }

  return timingSafeEqual(digest(expected), digest(candidate));
}

export function signMobileAuthPayload(payload: string, env: NodeJS.ProcessEnv = process.env) {
  const secret = configuredMobileAuthSecret(env);

  if (!secret) {
    throw new Error("MOBILE_AUTH_SECRET is missing or too short.");
  }

  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

export function verifyMobileAuthSignature(
  payload: string,
  signature: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
) {
  const secret = configuredMobileAuthSecret(env);

  if (!secret || !signature) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
  return timingSafeEqual(digest(expected), digest(signature));
}
