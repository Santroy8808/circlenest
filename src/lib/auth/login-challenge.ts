import { createHmac, timingSafeEqual } from "crypto";

export const LOGIN_CHALLENGE_COOKIE = "theta-login-challenge";
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

type LoginChallengePayload = {
  userId: string;
  email: string;
  expiresAt: number;
};

function getSecret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "theta-space-dev-secret";
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createLoginChallenge(input: { userId: string; email: string }): string {
  const payload: LoginChallengePayload = {
    userId: input.userId,
    email: input.email,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyLoginChallenge(token: string): { userId: string; email: string } | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = sign(encodedPayload);
  const left = Buffer.from(signature, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return null;
  if (!timingSafeEqual(left, right)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as LoginChallengePayload;
    if (!payload?.userId || !payload?.email || !payload?.expiresAt) return null;
    if (payload.expiresAt < Date.now()) return null;
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}

