import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/platform/db";
import { escapeHtml, platformWebsiteUrl } from "@/lib/platform/email-theme";
import { readPlatformEnv } from "@/lib/platform/env";

const OPTIONAL_SYSTEM_EMAIL_OPTOUT_MESSAGE = "This address has unsubscribed from Theta-Space system emails.";

export class OptionalSystemEmailOptOutError extends Error {
  constructor(message = OPTIONAL_SYSTEM_EMAIL_OPTOUT_MESSAGE) {
    super(message);
    this.name = "OptionalSystemEmailOptOutError";
  }
}

function normalizeEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function readSigningSecret() {
  const secret = readPlatformEnv().NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for optional system email unsubscribe links.");
  return secret;
}

function signEmail(email: string) {
  return createHmac("sha256", readSigningSecret())
    .update(email)
    .digest("base64url");
}

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;
  const visibleLocal = localPart.length <= 2 ? localPart[0] ?? "" : `${localPart.slice(0, 2)}${"*".repeat(Math.max(1, localPart.length - 2))}`;
  return `${visibleLocal}@${domain}`;
}

export function createOptionalSystemEmailUnsubscribeToken(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error("A valid email address is required.");
  const payload = Buffer.from(normalizedEmail, "utf8").toString("base64url");
  const signature = signEmail(normalizedEmail);
  return `${payload}.${signature}`;
}

export function inspectOptionalSystemEmailUnsubscribeToken(token: string | null | undefined) {
  const trimmedToken = token?.trim();
  if (!trimmedToken) return null;

  const [payload, signature] = trimmedToken.split(".");
  if (!payload || !signature) return null;

  let decodedEmail: string;
  try {
    decodedEmail = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const normalizedEmail = normalizeEmail(decodedEmail);
  if (!normalizedEmail) return null;

  const expectedSignature = signEmail(normalizedEmail);
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  return {
    email: normalizedEmail,
    maskedEmail: maskEmail(normalizedEmail)
  };
}

export function createOptionalSystemEmailUnsubscribeUrl(email: string) {
  const token = createOptionalSystemEmailUnsubscribeToken(email);
  return platformWebsiteUrl(`/unsubscribe?token=${encodeURIComponent(token)}`);
}

export function buildOptionalSystemEmailUnsubscribeText(email: string) {
  const unsubscribeUrl = createOptionalSystemEmailUnsubscribeUrl(email);
  return [
    "",
    "To stop optional Theta-Space system emails like beta reminders and invite follow-ups, visit:",
    unsubscribeUrl,
    "",
    "Required account, login, and security emails will still be sent."
  ].join("\n");
}

export function buildOptionalSystemEmailUnsubscribeHtml(email: string) {
  const unsubscribeUrl = createOptionalSystemEmailUnsubscribeUrl(email);
  const safeUrl = escapeHtml(unsubscribeUrl);

  return `
    <p style="margin:22px 0 0;color:#7f8da3;font-size:12px;line-height:1.7;">
      Stop optional Theta-Space system emails like beta reminders and invite follow-ups:
      <a href="${safeUrl}" style="color:#6d91ff;text-decoration:underline;">Unsubscribe</a><br>
      Required account, login, and security emails will still be sent.
    </p>
  `;
}

export async function isOptionalSystemEmailAllowed(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return true;

  const preference = await prisma.systemEmailPreference.findUnique({
    where: { email: normalizedEmail },
    select: { allowOptionalSystemEmails: true }
  });

  return preference?.allowOptionalSystemEmails !== false;
}

export async function assertOptionalSystemEmailAllowed(email: string) {
  const allowed = await isOptionalSystemEmailAllowed(email);
  if (!allowed) throw new OptionalSystemEmailOptOutError();
}

export async function listOptionalSystemEmailOptOuts(emails: string[]) {
  const normalizedEmails = [...new Set(emails.map((email) => normalizeEmail(email)).filter((email): email is string => Boolean(email)))];
  if (normalizedEmails.length === 0) return new Set<string>();

  const preferences = await prisma.systemEmailPreference.findMany({
    where: {
      email: { in: normalizedEmails },
      allowOptionalSystemEmails: false
    },
    select: { email: true }
  });

  return new Set(preferences.map((preference) => preference.email));
}

export async function unsubscribeOptionalSystemEmailByToken(token: string) {
  const details = inspectOptionalSystemEmailUnsubscribeToken(token);
  if (!details) return null;

  await prisma.systemEmailPreference.upsert({
    where: { email: details.email },
    update: {
      allowOptionalSystemEmails: false,
      optionalSystemEmailsUnsubscribedAt: new Date()
    },
    create: {
      email: details.email,
      allowOptionalSystemEmails: false,
      optionalSystemEmailsUnsubscribedAt: new Date()
    }
  });

  return details;
}
