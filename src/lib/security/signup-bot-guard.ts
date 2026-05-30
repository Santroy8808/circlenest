import { prisma } from "@/lib/db/prisma";

const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP = 12;
const MAX_ATTEMPTS_PER_EMAIL = 6;
const MIN_FORM_FILL_MS = 2500;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getClientIpFromRequest(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const forwardedFor = request.headers.get("x-forwarded-for")?.trim();
  if (forwardedFor) {
    const [first] = forwardedFor.split(",");
    if (first?.trim()) return first.trim();
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

export function getUserAgentFromRequest(request: Request): string | null {
  const value = request.headers.get("user-agent")?.trim();
  return value || null;
}

export function isSuspiciousFormTiming(formStartedAt: unknown): boolean {
  const parsed = typeof formStartedAt === "number" ? formStartedAt : Number(formStartedAt);
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed < MIN_FORM_FILL_MS;
}

export async function isSignupRateLimited(ipAddress: string, email: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - SIGNUP_WINDOW_MS);
  const normalizedEmail = normalizeEmail(email);
  const emailMarker = `"email":"${normalizedEmail}"`;

  const [ipAttempts, emailAttempts] = await Promise.all([
    prisma.authSecurityEvent.count({
      where: {
        eventType: "SIGNUP_ATTEMPT",
        ipAddress,
        createdAt: { gte: cutoff },
      },
    }),
    prisma.authSecurityEvent.count({
      where: {
        eventType: "SIGNUP_ATTEMPT",
        createdAt: { gte: cutoff },
        metadata: { contains: emailMarker },
      },
    }),
  ]);

  return ipAttempts >= MAX_ATTEMPTS_PER_IP || emailAttempts >= MAX_ATTEMPTS_PER_EMAIL;
}

export async function recordSignupSecurityEvent(args: {
  eventType: string;
  ipAddress: string;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.authSecurityEvent.create({
    data: {
      eventType: args.eventType,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent ?? null,
      metadata: args.metadata ? JSON.stringify(args.metadata) : null,
    },
  });
}

export async function verifyTurnstileToken(args: {
  token?: string | null;
  ipAddress?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return { ok: true };

  const token = args.token?.trim();
  if (!token) return { ok: false, reason: "missing_turnstile_token" };

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (args.ipAddress && args.ipAddress !== "unknown") form.set("remoteip", args.ipAddress);

  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    cache: "no-store",
  });

  if (!result.ok) return { ok: false, reason: "turnstile_http_error" };

  const body = (await result.json()) as { success?: boolean };
  return body.success ? { ok: true } : { ok: false, reason: "turnstile_failed" };
}
