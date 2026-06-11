import { createHmac, timingSafeEqual } from "crypto";
import { getPublicBaseUrl } from "@/lib/config/public-base-url";

export type BillingPlanTier = "PLUS" | "PRO";
export type BillingSubscriptionStatus =
  | "ACTIVE"
  | "TRIALING"
  | "PAST_DUE"
  | "UNPAID"
  | "CANCELED"
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "PAUSED"
  | "INACTIVE";

export type StripeBillingConfig = Readonly<{
  secretKey: string;
  webhookSecret: string;
  priceIdPlus: string;
  priceIdPro: string;
  portalReturnUrl: string | null;
}>;

export type BillingSubscriptionSnapshot = Readonly<{
  userId: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  subscriptionTier: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  trialEndsAt: Date | null;
  pausedAt: Date | null;
}>;

const BILLING_PLAN_TIERS: BillingPlanTier[] = ["PLUS", "PRO"];
const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export function normalizeBillingPlanTier(value: string | null | undefined): BillingPlanTier | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return BILLING_PLAN_TIERS.includes(normalized as BillingPlanTier) ? (normalized as BillingPlanTier) : null;
}

export function getStripeBillingConfig(): StripeBillingConfig {
  return {
    secretKey: process.env.STRIPE_SECRET_KEY?.trim() ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "",
    priceIdPlus: process.env.STRIPE_PRICE_ID_PLUS?.trim() ?? "",
    priceIdPro: process.env.STRIPE_PRICE_ID_PRO?.trim() ?? "",
    portalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL?.trim() || null,
  };
}

export function resolveStripePriceId(tier: BillingPlanTier, config = getStripeBillingConfig()) {
  return tier === "PLUS" ? config.priceIdPlus : config.priceIdPro;
}

export function normalizeBillingStatus(value: string | null | undefined): BillingSubscriptionStatus {
  const normalized = String(value ?? "").trim().toUpperCase();
  switch (normalized) {
    case "ACTIVE":
    case "TRIALING":
    case "PAST_DUE":
    case "UNPAID":
    case "CANCELED":
    case "INCOMPLETE":
    case "INCOMPLETE_EXPIRED":
    case "PAUSED":
      return normalized;
    default:
      return "INACTIVE";
  }
}

export function resolveEffectiveAccessTier(snapshot: BillingSubscriptionSnapshot): BillingPlanTier | "FREE" {
  const planTier = normalizeBillingPlanTier(snapshot.subscriptionTier) ?? "PLUS";
  if (snapshot.status === "ACTIVE" || snapshot.status === "TRIALING") {
    return planTier;
  }
  if (snapshot.cancelAtPeriodEnd && snapshot.currentPeriodEnd && snapshot.currentPeriodEnd.getTime() > Date.now()) {
    return planTier;
  }
  return "FREE";
}

export function resolveBillingPortalReturnUrl(request: Request, configuredUrl: string | null) {
  if (configuredUrl) return resolveMaybeRelativeUrl(request, configuredUrl);
  return `${getPublicBaseUrl(request)}/settings?billing=portal`;
}

export function resolveBillingCheckoutUrl(request: Request, suffix: string) {
  return `${getPublicBaseUrl(request)}/settings?billing=${suffix}`;
}

export async function postStripeForm(
  path: string,
  secretKey: string,
  params: URLSearchParams,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, body };
}

export function verifyStripeWebhookSignature(rawBody: string, signatureHeader: string | null, webhookSecret: string) {
  if (!signatureHeader || !webhookSecret) return false;

  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) ?? "";
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3)).filter(Boolean);
  if (!timestamp || !signatures.length) return false;

  const parsedTimestamp = Number(timestamp);
  if (!Number.isFinite(parsedTimestamp)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - parsedTimestamp);
  if (ageSeconds > STRIPE_WEBHOOK_TOLERANCE_SECONDS) return false;

  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", webhookSecret).update(payload).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return signatures.some((signature) => {
    const candidateBuffer = Buffer.from(signature, "utf8");
    if (candidateBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(candidateBuffer, expectedBuffer);
  });
}

export function resolveSubscriptionTierFromStripe(input: {
  metadata?: Record<string, unknown> | null;
  priceId?: string | null;
}): BillingPlanTier | null {
  const metadataTier = normalizeBillingPlanTier(typeof input.metadata?.tier === "string" ? input.metadata.tier : null);
  if (metadataTier) return metadataTier;

  if (input.priceId) {
    if (input.priceId === process.env.STRIPE_PRICE_ID_PLUS?.trim()) return "PLUS";
    if (input.priceId === process.env.STRIPE_PRICE_ID_PRO?.trim()) return "PRO";
  }

  return null;
}

export function toDateFromUnixSeconds(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveMaybeRelativeUrl(request: Request, value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value, getPublicBaseUrl(request)).toString();
}
