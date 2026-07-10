import { z } from "zod";

export const cuidIdSchema = z.string().trim().cuid().max(64);

export function isSafeHttpsUrl(value: string) {
  if (/\p{Cc}/u.test(value)) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export const requiredHttpsUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter an HTTPS URL.")
  .max(600)
  .refine(isSafeHttpsUrl, "Use a valid HTTPS URL without embedded credentials.");

export const optionalHttpsUrlSchema = z
  .string()
  .trim()
  .max(600)
  .refine((value) => value.length === 0 || isSafeHttpsUrl(value), "Use a valid HTTPS URL without embedded credentials.")
  .optional()
  .or(z.literal(""));

export function safeRelativePath(value: string | null | undefined, fallback = "/") {
  const path = value?.trim();
  if (
    !path ||
    path.length > 2048 ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\r\n]/.test(path) ||
    /%5c/i.test(path)
  ) {
    return fallback;
  }

  try {
    const base = "https://theta-space.invalid";
    if (new URL(path, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }

  return path;
}
