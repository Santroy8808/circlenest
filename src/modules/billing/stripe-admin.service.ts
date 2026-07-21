import { MembershipTier, Prisma, StripeIntegrationMode } from "@prisma/client";
import { z } from "zod";
import { findAuditLogByOperationId, writeAuditLog } from "@/lib/platform/audit";
import { createCommandFingerprint, isMatchingCommandFingerprint } from "@/lib/platform/command-fingerprint";
import { prisma } from "@/lib/platform/db";
import { readPlatformEnv } from "@/lib/platform/env";
import { isGodRole } from "@/lib/platform/roles";
import { getStripeRuntimeConfig } from "@/lib/platform/stripe";
import { diagnostics } from "@/lib/platform/logging";
import { ensureDefaultStripeCreditPackages, listStripeCreditPackages } from "@/modules/billing/stripe-credit-checkout.service";
import { ensureLaunchDefaults, listSubscriptionPlanRules } from "@/modules/membership-policy/launch-access.service";
import { isOperationalMembershipTier } from "@/modules/membership-policy/policy";
import { environmentSecretStore, isValidSecretEnvironmentVariable } from "@/modules/billing/environment-secret-store";

const MODULE_KEY = "stripe-admin";

export const stripeConnectionSchema = z.object({
  commandId: z.string().trim().min(8).max(160),
  mode: z.nativeEnum(StripeIntegrationMode).default(StripeIntegrationMode.TEST),
  publishableKey: z.string().trim().max(240).optional().or(z.literal("")),
  secretKey: z.literal("").optional(),
  webhookSecret: z.literal("").optional(),
  secretKeyEnvVar: z.string().trim().refine(isValidSecretEnvironmentVariable, "Enter a valid environment-variable name.").optional(),
  webhookSecretEnvVar: z.string().trim().refine(isValidSecretEnvironmentVariable, "Enter a valid environment-variable name.").optional(),
  currency: z.string().trim().toLowerCase().regex(/^[a-z]{3}$/).default("usd"),
  subscriptionCheckoutEnabled: z.boolean().default(true),
  creditCheckoutEnabled: z.boolean().default(false),
  clearPublishableKey: z.boolean().default(false),
  clearSecretKey: z.boolean().default(false),
  clearWebhookSecret: z.boolean().default(false)
});

export const stripeSubscriptionPriceSchema = z.object({
  commandId: z.string().trim().min(8).max(160),
  tier: z.nativeEnum(MembershipTier),
  stripePriceId: z.string().trim().max(240).optional().or(z.literal(""))
});

export const stripeCreditPackageSchema = z.object({
  commandId: z.string().trim().min(8).max(160),
  key: z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/),
  label: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  creditAmount: z.coerce.number().int().min(1).max(1_000_000),
  priceCents: z.coerce.number().int().min(50).max(1_000_000),
  stripePriceId: z.string().trim().max(240).optional().or(z.literal("")),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1_000_000).default(0)
});

async function isGodUser(userId?: string) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, deactivatedAt: true }
  });
  return Boolean(user && !user.deactivatedAt && canChangeStripePricing(user.role));
}

export function canChangeStripePricing(role?: Parameters<typeof isGodRole>[0] | null) {
  return isGodRole(role);
}

export function stripeSubscriptionPriceRequestId(tier: MembershipTier) {
  return `stripe-subscription-price:${tier}`;
}

export function stripeCreditPackageRequestId(key: string) {
  return `stripe-credit-package:${key.trim().toLowerCase()}`;
}

export function isMatchingStripePricingReplay(
  replay: {
    actorUserId: string | null;
    action: string;
    requestId: string | null;
    targetType: string | null;
    targetId: string | null;
    metadata: Prisma.JsonValue;
  },
  actorUserId: string,
  action: "stripe.subscription_price.updated" | "stripe.credit_package.saved",
  requestId: string,
  commandFingerprint: string
) {
  const targetType = action === "stripe.subscription_price.updated" ? "SubscriptionPlanRule" : "StripeCreditPackage";
  return replay.requestId === requestId && isMatchingCommandFingerprint(replay, {
    actorUserId,
    action,
    target: { type: targetType, id: requestId },
    fingerprint: commandFingerprint
  });
}

async function recoverConcurrentStripePricingReplay(
  commandId: string,
  actorUserId: string,
  action: "stripe.subscription_price.updated" | "stripe.credit_package.saved",
  requestId: string,
  commandFingerprint: string
) {
  const replay = await findAuditLogByOperationId(commandId);
  if (!replay) return "missing" as const;
  return isMatchingStripePricingReplay(replay, actorUserId, action, requestId, commandFingerprint)
    ? "replay" as const
    : "conflict" as const;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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
  const secretKeyEnvironmentVariable = saved ? saved.secretKeyEnvVar?.trim() || null : "STRIPE_SECRET_KEY";
  const webhookSecretEnvironmentVariable = saved
    ? saved.webhookSecretEnvVar?.trim() || null
    : "STRIPE_WEBHOOK_SECRET";
  const [secretKeyDescriptor, webhookSecretDescriptor] = await Promise.all([
    secretKeyEnvironmentVariable
      ? environmentSecretStore.describe({ provider: "environment", environmentVariable: secretKeyEnvironmentVariable })
      : Promise.resolve({ configured: false as const, source: "missing" as const }),
    webhookSecretEnvironmentVariable
      ? environmentSecretStore.describe({ provider: "environment", environmentVariable: webhookSecretEnvironmentVariable })
      : Promise.resolve({ configured: false as const, source: "missing" as const })
  ]);

  return {
    connection: {
      mode: runtime.mode,
      currency: runtime.currency,
      subscriptionCheckoutEnabled: runtime.subscriptionCheckoutEnabled,
      creditCheckoutEnabled: runtime.creditCheckoutEnabled,
      webhookEndpoint: "https://theta-space.net/api/billing/stripe/webhook",
      publishableKeyConfigured: Boolean(runtime.publishableKey),
      secretKeyConfigured: secretKeyDescriptor.configured,
      webhookSecretConfigured: webhookSecretDescriptor.configured,
      publishableKeySource: runtime.source.publishableKey,
      secretKeySource: secretKeyDescriptor.source,
      webhookSecretSource: webhookSecretDescriptor.source,
      publishableKeyPreview: maskSecret(saved?.publishableKey ?? env.STRIPE_PUBLISHABLE_KEY),
      secretKeyPreview: secretKeyDescriptor.configured ? `Configured in ${secretKeyEnvironmentVariable}` : null,
      webhookSecretPreview: webhookSecretDescriptor.configured ? `Configured in ${webhookSecretEnvironmentVariable}` : null
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
  if (!(await isGodUser(actorUserId))) {
    return { ok: false as const, error: "God access is required to change payment secrets." };
  }

  const parsed = stripeConnectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid Stripe connection settings." };
  }

  const action = "stripe.connection.updated";
  const target = { type: "StripeIntegrationConfig", id: "default" };
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action,
    target,
    payload: {
      mode: parsed.data.mode,
      publishableKey: parsed.data.publishableKey || null,
      secretKeyEnvVar: parsed.data.secretKeyEnvVar ?? null,
      webhookSecretEnvVar: parsed.data.webhookSecretEnvVar ?? null,
      currency: parsed.data.currency,
      subscriptionCheckoutEnabled: parsed.data.subscriptionCheckoutEnabled,
      creditCheckoutEnabled: parsed.data.creditCheckoutEnabled,
      clearPublishableKey: parsed.data.clearPublishableKey,
      clearSecretKey: parsed.data.clearSecretKey,
      clearWebhookSecret: parsed.data.clearWebhookSecret
    }
  });
  const replay = await findAuditLogByOperationId(parsed.data.commandId);
  if (replay) {
    return isMatchingCommandFingerprint(replay, { actorUserId, action, target, fingerprint: commandFingerprint })
      ? { ok: true as const, view: await getStripeSetupAdminView(), replayed: true as const }
      : { ok: false as const, error: "That administrator command id has already been used." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.stripeIntegrationConfig.findUnique({ where: { id: "default" } });
      const nextPublishableKey = parsed.data.clearPublishableKey
        ? null
        : (parsed.data.publishableKey || existing?.publishableKey || null);
      const nextSecretKeyEnvVar = parsed.data.clearSecretKey
        ? null
        : (parsed.data.secretKeyEnvVar || existing?.secretKeyEnvVar || "STRIPE_SECRET_KEY");
      const nextWebhookSecretEnvVar = parsed.data.clearWebhookSecret
        ? null
        : (parsed.data.webhookSecretEnvVar || existing?.webhookSecretEnvVar || "STRIPE_WEBHOOK_SECRET");
      const data = {
        mode: parsed.data.mode,
        currency: parsed.data.currency,
        subscriptionCheckoutEnabled: parsed.data.subscriptionCheckoutEnabled,
        creditCheckoutEnabled: parsed.data.creditCheckoutEnabled,
        updatedByUserId: actorUserId,
        publishableKey: nextPublishableKey,
        secretKeyEnvVar: nextSecretKeyEnvVar,
        webhookSecretEnvVar: nextWebhookSecretEnvVar
      };

      await tx.stripeIntegrationConfig.upsert({
        where: { id: "default" },
        update: data,
        create: { id: "default", ...data }
      });
      await writeAuditLog({
        operationId: parsed.data.commandId,
        actorUserId,
        module: MODULE_KEY,
        action,
        targetType: target.type,
        targetId: target.id,
        severity: "warning",
        before: {
          mode: existing?.mode ?? null,
          currency: existing?.currency ?? null,
          secretKeyEnvVar: existing?.secretKeyEnvVar ?? null,
          webhookSecretEnvVar: existing?.webhookSecretEnvVar ?? null
        },
        after: {
          mode: parsed.data.mode,
          currency: parsed.data.currency,
          secretKeyEnvVar: nextSecretKeyEnvVar,
          webhookSecretEnvVar: nextWebhookSecretEnvVar
        },
        metadata: {
          commandFingerprint,
          subscriptionCheckoutEnabled: parsed.data.subscriptionCheckoutEnabled,
          creditCheckoutEnabled: parsed.data.creditCheckoutEnabled,
          publishableKeyChanged: Boolean(parsed.data.publishableKey || parsed.data.clearPublishableKey)
        }
      }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const concurrentReplay = await findAuditLogByOperationId(parsed.data.commandId);
      if (concurrentReplay) {
        if (isMatchingCommandFingerprint(concurrentReplay, { actorUserId, action, target, fingerprint: commandFingerprint })) {
          return { ok: true as const, view: await getStripeSetupAdminView(), replayed: true as const };
        }
        return { ok: false as const, error: "That administrator command id has already been used." };
      }
    }
    throw error;
  }
  await diagnostics.info(MODULE_KEY, "Admin updated Stripe connection settings.", { actorUserId });

  return { ok: true as const, view: await getStripeSetupAdminView(), replayed: false as const };
}

export async function updateStripeSubscriptionPrice(actorUserId: string, input: unknown) {
  if (!(await isGodUser(actorUserId))) {
    return { ok: false as const, error: "God access is required to change subscription pricing." };
  }

  const parsed = stripeSubscriptionPriceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid subscription price." };
  }
  const requestId = stripeSubscriptionPriceRequestId(parsed.data.tier);
  const action = "stripe.subscription_price.updated";
  const target = { type: "SubscriptionPlanRule", id: requestId };
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action,
    target,
    payload: {
      tier: parsed.data.tier,
      stripePriceId: parsed.data.stripePriceId || null
    }
  });
  const replay = await findAuditLogByOperationId(parsed.data.commandId);
  if (replay) {
    return isMatchingStripePricingReplay(replay, actorUserId, action, requestId, commandFingerprint)
      ? { ok: true as const, view: await getStripeSetupAdminView(), replayed: true as const }
      : { ok: false as const, error: "That administrator command id has already been used." };
  }

  if (!isOperationalMembershipTier(parsed.data.tier)) {
    return { ok: false as const, error: "That membership tier is currently disabled." };
  }

  await ensureLaunchDefaults();
  try {
    await prisma.$transaction(async (tx) => {
      const previous = await tx.subscriptionPlanRule.findUnique({ where: { tier: parsed.data.tier } });
      const rule = await tx.subscriptionPlanRule.update({
        where: { tier: parsed.data.tier },
        data: { stripePriceId: parsed.data.stripePriceId || null }
      });
      await writeAuditLog({
        operationId: parsed.data.commandId,
        requestId,
        actorUserId,
        module: MODULE_KEY,
        action,
        targetType: target.type,
        targetId: target.id,
        severity: "warning",
        before: { stripePriceIdConfigured: Boolean(previous?.stripePriceId) },
        after: { stripePriceIdConfigured: Boolean(rule.stripePriceId) },
        metadata: { commandFingerprint, tier: parsed.data.tier, recordId: rule.id }
      }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const concurrentReplay = await recoverConcurrentStripePricingReplay(
        parsed.data.commandId,
        actorUserId,
        action,
        requestId,
        commandFingerprint
      );
      if (concurrentReplay === "replay") {
        return { ok: true as const, view: await getStripeSetupAdminView(), replayed: true as const };
      }
      if (concurrentReplay === "conflict") {
        return { ok: false as const, error: "That administrator command id has already been used." };
      }
    }
    throw error;
  }

  return { ok: true as const, view: await getStripeSetupAdminView(), replayed: false as const };
}

export async function upsertStripeCreditPackage(actorUserId: string, input: unknown) {
  if (!(await isGodUser(actorUserId))) {
    return { ok: false as const, error: "God access is required to change credit-package pricing." };
  }

  const parsed = stripeCreditPackageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid credit package." };
  }
  const requestId = stripeCreditPackageRequestId(parsed.data.key);
  const action = "stripe.credit_package.saved";
  const target = { type: "StripeCreditPackage", id: requestId };
  const commandFingerprint = createCommandFingerprint({
    actorUserId,
    action,
    target,
    payload: {
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
  const replay = await findAuditLogByOperationId(parsed.data.commandId);
  if (replay) {
    return isMatchingStripePricingReplay(replay, actorUserId, action, requestId, commandFingerprint)
      ? { ok: true as const, view: await getStripeSetupAdminView(), replayed: true as const }
      : { ok: false as const, error: "That administrator command id has already been used." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const previous = await tx.stripeCreditPackage.findUnique({ where: { key: parsed.data.key } });
      const packageRule = await tx.stripeCreditPackage.upsert({
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
        operationId: parsed.data.commandId,
        requestId,
        actorUserId,
        module: MODULE_KEY,
        action,
        targetType: target.type,
        targetId: target.id,
        severity: "warning",
        before: previous
          ? {
              creditAmount: previous.creditAmount,
              priceCents: previous.priceCents,
              stripePriceIdConfigured: Boolean(previous.stripePriceId),
              active: previous.active
            }
          : {},
        after: {
          creditAmount: packageRule.creditAmount,
          priceCents: packageRule.priceCents,
          stripePriceIdConfigured: Boolean(packageRule.stripePriceId),
          active: packageRule.active
        },
        metadata: { commandFingerprint, key: packageRule.key, recordId: packageRule.id }
      }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const concurrentReplay = await recoverConcurrentStripePricingReplay(
        parsed.data.commandId,
        actorUserId,
        action,
        requestId,
        commandFingerprint
      );
      if (concurrentReplay === "replay") {
        return { ok: true as const, view: await getStripeSetupAdminView(), replayed: true as const };
      }
      if (concurrentReplay === "conflict") {
        return { ok: false as const, error: "That administrator command id has already been used." };
      }
    }
    throw error;
  }

  return { ok: true as const, view: await getStripeSetupAdminView(), replayed: false as const };
}
