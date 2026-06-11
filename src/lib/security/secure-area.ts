import crypto from "node:crypto";
import { SECURE_AREA_IDLE_MINUTES, SECURE_AREA_TTL_MS } from "@/lib/security/secure-area.shared";

export const SECURE_AREA_COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-theta-secure-area" : "theta-secure-area";

const SECURE_AREA_SECRET = process.env.NEXTAUTH_SECRET || "dev-secure-area-secret";

type SecureAreaPayload = {
  userId: string;
  expiresAt: number;
};

function toBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function sign(input: string): string {
  return toBase64Url(crypto.createHmac("sha256", SECURE_AREA_SECRET).update(input).digest());
}

export function createSecureAreaToken(userId: string, now = Date.now()): string {
  const payload: SecureAreaPayload = {
    userId,
    expiresAt: now + SECURE_AREA_TTL_MS,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function readSecureAreaToken(token: string | undefined | null): SecureAreaPayload | null {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  const expected = sign(encodedPayload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as SecureAreaPayload;
    if (!payload.userId || typeof payload.expiresAt !== "number") return null;
    if (payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hasSecureAreaAccess(userId: string, token: string | undefined | null): boolean {
  const payload = readSecureAreaToken(token);
  return Boolean(payload && payload.userId === userId);
}

export function createSecureAreaCookie(userId: string) {
  return {
    name: SECURE_AREA_COOKIE_NAME,
    value: createSecureAreaToken(userId),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function clearSecureAreaCookie() {
  return {
    name: SECURE_AREA_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export function buildSecureAreaRedirect(nextPath: string, reason?: "idle" | "locked") {
  const params = new URLSearchParams({ next: nextPath });
  if (reason) params.set("reason", reason);
  return `/secure-area?${params.toString()}`;
}

export function isSecureAreaRoute(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/moderation") ||
    pathname.startsWith("/profile/edit") ||
    pathname.startsWith("/profile/gallery") ||
    pathname.startsWith("/profile/scientology") ||
    pathname.startsWith("/profile/resume") ||
    pathname.startsWith("/settings")
  );
}
