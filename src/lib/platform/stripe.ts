import Stripe from "stripe";
import { prisma } from "@/lib/platform/db";
import { readPlatformEnv } from "@/lib/platform/env";
import { environmentSecretStore } from "@/modules/billing/environment-secret-store";

let stripeClient: Stripe | null = null;
let stripeClientSecretKey: string | null = null;

export type StripeRuntimeConfig = {
  mode: "TEST" | "LIVE";
  publishableKey: string | null;
  secretKey: string | null;
  webhookSecret: string | null;
  currency: string;
  subscriptionCheckoutEnabled: boolean;
  creditCheckoutEnabled: boolean;
  source: {
    publishableKey: "database" | "env" | "missing";
    secretKey: "env" | "missing";
    webhookSecret: "env" | "missing";
  };
};

function publishableKeySource(databaseValue: string | null | undefined, envValue: string | null | undefined) {
  if (databaseValue?.trim()) return "database" as const;
  if (envValue?.trim()) return "env" as const;
  return "missing" as const;
}

export async function getStripeRuntimeConfig(): Promise<StripeRuntimeConfig> {
  const env = readPlatformEnv();
  const saved = await prisma.stripeIntegrationConfig.findUnique({
    where: { id: "default" },
    select: {
      mode: true,
      publishableKey: true,
      secretKeyEnvVar: true,
      webhookSecretEnvVar: true,
      currency: true,
      subscriptionCheckoutEnabled: true,
      creditCheckoutEnabled: true
    }
  });

  const publishableKey = saved?.publishableKey?.trim() || env.STRIPE_PUBLISHABLE_KEY || null;
  const secretKeyEnvVar = saved ? saved.secretKeyEnvVar?.trim() || null : "STRIPE_SECRET_KEY";
  const webhookSecretEnvVar = saved ? saved.webhookSecretEnvVar?.trim() || null : "STRIPE_WEBHOOK_SECRET";
  const [secretKey, webhookSecret] = await Promise.all([
    secretKeyEnvVar
      ? environmentSecretStore.resolve({ provider: "environment", environmentVariable: secretKeyEnvVar })
      : Promise.resolve(null),
    webhookSecretEnvVar
      ? environmentSecretStore.resolve({ provider: "environment", environmentVariable: webhookSecretEnvVar })
      : Promise.resolve(null)
  ]);

  return {
    mode: saved?.mode ?? "TEST",
    publishableKey,
    secretKey,
    webhookSecret,
    currency: saved?.currency?.trim().toLowerCase() || "usd",
    subscriptionCheckoutEnabled: saved?.subscriptionCheckoutEnabled ?? true,
    creditCheckoutEnabled: saved?.creditCheckoutEnabled ?? false,
    source: {
      publishableKey: publishableKeySource(saved?.publishableKey, env.STRIPE_PUBLISHABLE_KEY),
      secretKey: secretKey ? "env" : "missing",
      webhookSecret: webhookSecret ? "env" : "missing"
    }
  };
}

export async function getStripeClient() {
  const config = await getStripeRuntimeConfig();

  if (!config.secretKey) {
    throw new Error("Stripe is not configured.");
  }

  if (!stripeClient || stripeClientSecretKey !== config.secretKey) {
    stripeClient = new Stripe(config.secretKey, {
      apiVersion: "2026-05-27.dahlia"
    });
    stripeClientSecretKey = config.secretKey;
  }

  return stripeClient;
}

export async function getStripeWebhookSecret() {
  const config = await getStripeRuntimeConfig();

  if (!config.webhookSecret) {
    throw new Error("Stripe webhook secret is not configured.");
  }

  return config.webhookSecret;
}
