import crypto from "node:crypto";
import { ADMIN_MODE_IDLE_MINUTES, ADMIN_MODE_TTL_MS } from "@/lib/security/admin-mode.shared";

export const ADMIN_MODE_COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-theta-admin-mode" : "theta-admin-mode";

const ADMIN_MODE_SECRET = process.env.NEXTAUTH_SECRET || "dev-admin-mode-secret";

type AdminModePayload = {
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
  return toBase64Url(crypto.createHmac("sha256", ADMIN_MODE_SECRET).update(input).digest());
}

export function createAdminModeToken(userId: string, now = Date.now()): string {
  const payload: AdminModePayload = {
    userId,
    expiresAt: now + ADMIN_MODE_TTL_MS,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function readAdminModeToken(token: string | undefined | null): AdminModePayload | null {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  const expected = sign(encodedPayload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as AdminModePayload;
    if (!payload.userId || typeof payload.expiresAt !== "number") return null;
    if (payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hasAdminModeAccess(userId: string, token: string | undefined | null) {
  const payload = readAdminModeToken(token);
  return Boolean(payload && payload.userId === userId);
}

export function createAdminModeCookie(userId: string) {
  return {
    name: ADMIN_MODE_COOKIE_NAME,
    value: createAdminModeToken(userId),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function clearAdminModeCookie() {
  return {
    name: ADMIN_MODE_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}
