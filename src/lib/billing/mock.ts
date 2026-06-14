import { randomUUID } from "crypto";
import { mkdir, appendFile, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db/prisma";
import { getPublicBaseUrl } from "@/lib/config/public-base-url";
import {
  normalizeBillingPlanTier,
  resolveBillingCheckoutUrl,
  resolveBillingPortalReturnUrl,
  type BillingPlanTier,
} from "@/lib/billing/stripe";

export type MockBillingMode = "MOCK" | "STRIPE";

export type MockBillingLedgerEntry = Readonly<{
  id: string;
  occurredAt: string;
  eventType:
    | "signup.created"
    | "checkout.started"
    | "checkout.completed"
    | "portal.opened"
    | "subscription.renewed"
    | "subscription.updated"
    | "subscription.canceled"
    | "invoice.paid"
    | "invoice.failed";
  userId: string;
  username: string;
  email: string;
  tier: BillingPlanTier | "FREE";
  amountCents: number;
  providerCustomerId: string;
  providerSubscriptionId: string;
  status: string;
  monthKey: string;
  note?: string | null;
}>;

export const MOCK_BILLING_LEDGER_PATH = path.join(process.cwd(), "docs/operations/mock-billing/mock-billing-log.jsonl");
export const MOCK_BILLING_REPORT_DIR = path.join(process.cwd(), "docs/operations/mock-billing/reports");
export const MOCK_BILLING_OUTPUT_DIR = path.join(process.cwd(), "docs/operations/mock-billing");

export function resolveBillingMode() {
  const explicit = process.env.BILLING_PROVIDER?.trim().toLowerCase();
  if (explicit === "mock") return "MOCK" as const;
  if (explicit === "stripe") return "STRIPE" as const;

  if (process.env.NODE_ENV !== "production") {
    const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
    const contributorPrice = process.env.STRIPE_PRICE_ID_CONTRIBUTOR?.trim() ?? process.env.STRIPE_PRICE_ID_PLUS?.trim();
    const proPrice = process.env.STRIPE_PRICE_ID_PRO?.trim();
    if (!stripeSecret || !contributorPrice || !proPrice) return "MOCK" as const;
  }

  return "STRIPE" as const;
}

export function isMockBillingMode() {
  return resolveBillingMode() === "MOCK";
}

export function resolveMockBillingPriceCents(tier: BillingPlanTier) {
  return tier === "CONTRIBUTOR" ? 300 : 1000;
}

export function resolveMockBillingMonthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function resolveMockBillingPeriodEnd(startDate: Date) {
  return new Date(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate(), startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), startDate.getMilliseconds());
}

export async function ensureMockBillingOutputDirs() {
  await mkdir(MOCK_BILLING_OUTPUT_DIR, { recursive: true });
  await mkdir(MOCK_BILLING_REPORT_DIR, { recursive: true });
}

export async function appendMockBillingLedger(entry: MockBillingLedgerEntry) {
  await ensureMockBillingOutputDirs();
  await appendFile(MOCK_BILLING_LEDGER_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

export function buildMockBillingCustomerId(userId: string) {
  return `mock_cust_${userId}`;
}

export function buildMockBillingSubscriptionId(userId: string, tier: BillingPlanTier) {
  return `mock_sub_${tier.toLowerCase()}_${userId}`;
}

export async function handleMockCheckout(request: Request, userId: string, tier: BillingPlanTier) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, subscriptionTier: true, billingSubscription: true },
  });
  if (!user) {
    return { ok: false as const, status: 404, error: "User not found." };
  }

  const now = new Date();
  const providerCustomerId = buildMockBillingCustomerId(user.id);
  const providerSubscriptionId = buildMockBillingSubscriptionId(user.id, tier);
  const periodStart = now;
  const periodEnd = resolveMockBillingPeriodEnd(now);
  const amountCents = resolveMockBillingPriceCents(tier);

  await prisma.$transaction(async (tx) => {
    await tx.billingSubscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        provider: "MOCK",
        providerCustomerId,
        providerSubscriptionId,
        subscriptionTier: tier,
        status: "ACTIVE",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        trialEndsAt: null,
        pausedAt: null,
      },
      update: {
        provider: "MOCK",
        providerCustomerId,
        providerSubscriptionId,
        subscriptionTier: tier,
        status: "ACTIVE",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        trialEndsAt: null,
        pausedAt: null,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { subscriptionTier: tier },
    });
  });

  await appendMockBillingLedger({
    id: randomUUID(),
    occurredAt: now.toISOString(),
    eventType: "checkout.completed",
    userId: user.id,
    username: user.username,
    email: user.email,
    tier,
    amountCents,
    providerCustomerId,
    providerSubscriptionId,
    status: "ACTIVE",
    monthKey: resolveMockBillingMonthKey(now),
    note: "Mock checkout completed without Stripe.",
  });

  return {
    ok: true as const,
    status: 200,
    url: resolveBillingCheckoutUrl(request, "mock-checkout"),
  };
}

export async function handleMockPortal(request: Request, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      billingSubscription: {
        select: {
          providerCustomerId: true,
          providerSubscriptionId: true,
          subscriptionTier: true,
          status: true,
        },
      },
    },
  });
  if (!user) {
    return { ok: false as const, status: 404, error: "User not found." };
  }

  const now = new Date();
  await appendMockBillingLedger({
    id: randomUUID(),
    occurredAt: now.toISOString(),
    eventType: "portal.opened",
    userId: user.id,
    username: user.username,
    email: user.email,
    tier: normalizeBillingPlanTier(user.billingSubscription?.subscriptionTier) ?? "CONTRIBUTOR",
    amountCents: 0,
    providerCustomerId: user.billingSubscription?.providerCustomerId ?? buildMockBillingCustomerId(user.id),
    providerSubscriptionId: user.billingSubscription?.providerSubscriptionId ?? buildMockBillingSubscriptionId(user.id, normalizeBillingPlanTier(user.billingSubscription?.subscriptionTier) ?? "CONTRIBUTOR"),
    status: user.billingSubscription?.status ?? "ACTIVE",
    monthKey: resolveMockBillingMonthKey(now),
    note: "Mock billing portal opened without Stripe.",
  });

  return {
    ok: true as const,
    status: 200,
    url: resolveBillingPortalReturnUrl(request, `${getPublicBaseUrl(request)}/settings?billing=mock-portal`),
  };
}
