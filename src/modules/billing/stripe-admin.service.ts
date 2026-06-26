import { MembershipTier, Prisma, StripeIntegrationMode } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { readPlatformEnv } from "@/lib/platform/env";
import { isAdminRole } from "@/lib/platform/roles";
import { getStripeRuntimeConfig } from "@/lib/platform/stripe";
import { diagnostics } from "@/lib/platform/logging";
import { ensureDefaultStripeCreditPackages, listStripeCreditPackages } from "@/modules/billing/stripe-credit-checkout.service";
import { ensureLaunchDefaults, listSubscriptionPlanRules } from "@/modules/membership-policy/launch-access.service";

const MODULE_KEY = "stripe-admin";

export const stripeConnectionSchema = z.object({
  mode: z.nativeEnum(StripeIntegrationMode).default(StripeIntegrationMode.TEST),
  publishableKey: z.string().trim().max(240).optional().or(z.literal("")),
  secretKey: z.string().trim().max(240).optional().or(z.literal("")),
  webhookSecret: z.string().trim().max(240).optional().or(z.literal("")),
  currency: z.string().trim().toLowerCase().regex(/^[a-z]{3}$/).default("usd"),
  subscriptionCheckoutEnabled: z.boolean().default(true),
  creditCheckoutEnabled: z.boolean().default(false),
  clearPublishableKey: z.boolean().default(false),
  clearSecretKey: z.boolean().default(false),
  clearWebhookSecret: z.boolean().default(false)
});

export const stripeSubscriptionPriceSchema = z.object({
  tier: z.nativeEnum(MembershipTier),
  stripePriceId: z.string().trim().max(240).optional().or(z.literal(""))
});

export const stripeCreditPackageSchema = z.object({
  key: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/),
  label: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  creditAmount: z.coerce.number().int().min(1).max(1_000_000),
  priceCents: z.coerce.number().int().min(50).max(1_000_000),
  stripePriceId: z.string().trim().max(240).optional().or(z.literal("")),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1_000_000).default(0)
});

async function isAdminUser(userId?: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return isAdminRole(user?.role);
}

function maskSecret(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return "configured";
  return `${trimmed.slice(0, 7)}...${trimmed.slice(-4)}`;
}

export async function getStripeSetupAdminView() {
  await Promise.all([ensureLaunchDefaults(), ensureDefaultStripeCreditPackages()]);

  const env = readPlatformEnv();
  const [runtime, saved, subscriptionPlans, creditPackages] = await Promise.all([
    getStripeRuntimeConfig(),
    prisma.stripeIntegrationConfig.findUnique({ where: { id: "default" } }),
    listSubscriptionPlanRules(),
    listStripeCreditPackages(true)
  ]);

  return {
    connection: {
      mode: runtime.mode,
      currency: runtime.currency,
      subscriptionCheckoutEnabled: runtime.subscriptionCheckoutEnabled,
      creditCheckoutEnabled: runtime.creditCheckoutEnabled,
      webhookEndpoint: "https://theta-space.net/api/billing/stripe/webhook",
      publishableKeyConfigured: Boolean(runtime.publishableKey),
      secretKeyConfigured: Boolean(runtime.secretKey),
      webhookSecretConfigured: Boolean(runtime.webhookSecret),
      publishableKeySource: runtime.source.publishableKey,
      secretKeySource: runtime.source.secretKey,
      webhookSecretSource: runtime.source.webhookSecret,
      publishableKeyPreview: maskSecret(saved?.publishableKey ?? env.STRIPE_PUBLISHABLE_KEY),
      secretKeyPreview: maskSecret(saved?.secretKey ?? env.STRIPE_SECRET_KEY),
      webhookSecretPreview: maskSecret(saved?.webhookSecret ?? env.STRIPE_WEBHOOK_SECRET)
    },
    subscriptionPlans: subscriptionPlans.map((plan) => ({
      tier: plan.tier,
      displayName: plan.displayName,
      standardPriceCents: plan.standardPriceCents,
      stripePriceId: plan.stripePriceId,
      checkoutRequired: plan.tier !== MembershipTier.FREE
    })),
    creditPackages
  };
}

export type StripeSetupAdminView = Awaited<ReturnType<typeof getStripeSetupAdminView>>;

export async function updateStripeConnection(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = stripeConnectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid Stripe connection settings." };
  }

  const existing = await prisma.stripeIntegrationConfig.findUnique({
    where: { id: "default" }
  });
  const nextPublishableKey = parsed.data.clearPublishableKey ? null : (parsed.data.publishableKey || existing?.publishableKey || null);
  const nextSecretKey = parsed.data.clearSecretKey ? null : (parsed.data.secretKey || existing?.secretKey || null);
  const nextWebhookSecret = parsed.data.clearWebhookSecret ? null : (parsed.data.webhookSecret || existing?.webhookSecret || null);
  const data = {
    mode: parsed.data.mode,
    currency: parsed.data.currency,
    subscriptionCheckoutEnabled: parsed.data.subscriptionCheckoutEnabled,
    creditCheckoutEnabled: parsed.data.creditCheckoutEnabled,
    updatedByUserId: actorUserId,
    publishableKey: nextPublishableKey,
    secretKey: nextSecretKey,
    webhookSecret: nextWebhookSecret
  };

  await prisma.stripeIntegrationConfig.upsert({
    where: { id: "default" },
    update: data,
    create: {
      id: "default",
      ...data
    }
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "stripe.connection.updated",
    targetType: "StripeIntegrationConfig",
    targetId: "default",
    severity: "warning",
    metadata: {
      mode: parsed.data.mode,
      currency: parsed.data.currency,
      subscriptionCheckoutEnabled: parsed.data.subscriptionCheckoutEnabled,
      creditCheckoutEnabled: parsed.data.creditCheckoutEnabled,
      publishableKeyChanged: Boolean(parsed.data.publishableKey || parsed.data.clearPublishableKey),
      secretKeyChanged: Boolean(parsed.data.secretKey || parsed.data.clearSecretKey),
      webhookSecretChanged: Boolean(parsed.data.webhookSecret || parsed.data.clearWebhookSecret)
    } as Prisma.InputJsonObject
  });
  await diagnostics.info(MODULE_KEY, "Admin updated Stripe connection settings.", { actorUserId });

  return { ok: true as const, view: await getStripeSetupAdminView() };
}

export async function updateStripeSubscriptionPrice(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = stripeSubscriptionPriceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid subscription price." };
  }

  await ensureLaunchDefaults();
  const rule = await prisma.subscriptionPlanRule.update({
    where: { tier: parsed.data.tier },
    data: { stripePriceId: parsed.data.stripePriceId || null }
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "stripe.subscription_price.updated",
    targetType: "SubscriptionPlanRule",
    targetId: rule.id,
    severity: "warning",
    metadata: {
      tier: parsed.data.tier,
      stripePriceIdConfigured: Boolean(parsed.data.stripePriceId)
    } as Prisma.InputJsonObject
  });

  return { ok: true as const, view: await getStripeSetupAdminView() };
}

export async function upsertStripeCreditPackage(actorUserId: string, input: unknown) {
  if (!(await isAdminUser(actorUserId))) {
    return { ok: false as const, error: "Admin access required." };
  }

  const parsed = stripeCreditPackageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid credit package." };
  }

  const packageRule = await prisma.stripeCreditPackage.upsert({
    where: { key: parsed.data.key },
    update: {
      label: parsed.data.label,
      description: parsed.data.description || null,
      creditAmount: parsed.data.creditAmount,
      priceCents: parsed.data.priceCents,
      stripePriceId: parsed.data.stripePriceId || null,
      active: parsed.data.active,
      sortOrder: parsed.data.sortOrder
    },
    create: {
      key: parsed.data.key,
      label: parsed.data.label,
      description: parsed.data.description || null,
      creditAmount: parsed.data.creditAmount,
      priceCents: parsed.data.priceCents,
      stripePriceId: parsed.data.stripePriceId || null,
      active: parsed.data.active,
      sortOrder: parsed.data.sortOrder
    }
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "stripe.credit_package.saved",
    targetType: "StripeCreditPackage",
    targetId: packageRule.id,
    severity: "warning",
    metadata: {
      key: packageRule.key,
      creditAmount: packageRule.creditAmount,
      priceCents: packageRule.priceCents,
      stripePriceIdConfigured: Boolean(packageRule.stripePriceId),
      active: packageRule.active
    } as Prisma.InputJsonObject
  });

  return { ok: true as const, view: await getStripeSetupAdminView() };
}
