import "server-only";

import { prisma } from "@/lib/db/prisma";

export const PAYMENT_PROCESSOR_AREAS = [
  "MEMBERSHIP_SUBSCRIPTIONS",
  "MARKETPLACE_PAYMENTS",
  "FUNDRAISER_DONATIONS",
  "EVENT_PAYMENTS",
  "BUSINESS_ONBOARDING",
  "WITHDRAWALS_PAYOUTS",
  "PLATFORM_FEES",
] as const;

export const PAYMENT_PROCESSOR_MODES = ["SANDBOX", "PRODUCTION"] as const;
export const PAYMENT_PROCESSOR_PROVIDERS = ["STRIPE", "MANUAL_REVIEW", "OTHER"] as const;

export type PaymentProcessorConfigSummary = Readonly<{
  id: string;
  provider: string;
  area: string;
  mode: string;
  displayName: string;
  publicKeyLabel: string | null;
  publicKeyFingerprint: string | null;
  secretEnvVarName: string | null;
  webhookSecretEnvVarName: string | null;
  secretConfigured: boolean;
  webhookSecretConfigured: boolean;
  enabledFlows: string[];
  platformFeeBps: number;
  withdrawalBatchSchedule: string[];
  processorAccountStatus: string | null;
  webhookHealthStatus: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: Readonly<{ id: string; username: string; email: string }> | null;
  recentWebhookEvents: ReadonlyArray<{
    id: string;
    eventId: string;
    eventType: string;
    status: string;
    receivedAt: string;
    processedAt: string | null;
    retryCount: number;
    lastError: string | null;
  }>;
}>;

type ProcessorConfigSource = {
  id: string;
  provider: string;
  area: string;
  mode: string;
  displayName: string;
  publicKeyLabel: string | null;
  publicKeyFingerprint: string | null;
  secretEnvVarName: string | null;
  webhookSecretEnvVarName: string | null;
  secretConfigured: boolean;
  webhookSecretConfigured: boolean;
  enabledFlowsJson: string | null;
  platformFeeBps: number;
  withdrawalBatchScheduleJson: string | null;
  processorAccountStatus: string | null;
  webhookHealthStatus: string;
  isEnabled: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  updatedBy?: { id: string; username: string; email: string } | null;
  webhookEvents?: Array<{
    id: string;
    eventId: string;
    eventType: string;
    status: string;
    receivedAt: Date | string;
    processedAt: Date | string | null;
    retryCount: number;
    lastError: string | null;
  }>;
};

function normalizeDate(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseJsonArray(value: string | null, fallback: string[] = []) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeKey(value: string, allowed: readonly string[], fallback: string) {
  const normalized = value.trim().toUpperCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

export function readEnvPresence(envVarName: string | null | undefined) {
  if (!envVarName) return false;
  return Boolean(process.env[envVarName]?.trim());
}

export function fingerprintPublicKey(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

export function serializePaymentProcessorConfig(config: ProcessorConfigSource): PaymentProcessorConfigSummary {
  return {
    id: config.id,
    provider: config.provider,
    area: config.area,
    mode: config.mode,
    displayName: config.displayName,
    publicKeyLabel: config.publicKeyLabel,
    publicKeyFingerprint: config.publicKeyFingerprint,
    secretEnvVarName: config.secretEnvVarName,
    webhookSecretEnvVarName: config.webhookSecretEnvVarName,
    secretConfigured: config.secretConfigured || readEnvPresence(config.secretEnvVarName),
    webhookSecretConfigured: config.webhookSecretConfigured || readEnvPresence(config.webhookSecretEnvVarName),
    enabledFlows: parseJsonArray(config.enabledFlowsJson),
    platformFeeBps: config.platformFeeBps,
    withdrawalBatchSchedule: parseJsonArray(config.withdrawalBatchScheduleJson, ["TUESDAY", "THURSDAY", "SATURDAY"]),
    processorAccountStatus: config.processorAccountStatus,
    webhookHealthStatus: config.webhookHealthStatus,
    isEnabled: config.isEnabled,
    createdAt: normalizeDate(config.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeDate(config.updatedAt) ?? new Date().toISOString(),
    updatedBy: config.updatedBy
      ? {
          id: config.updatedBy.id,
          username: config.updatedBy.username,
          email: config.updatedBy.email,
        }
      : null,
    recentWebhookEvents: (config.webhookEvents ?? []).map((event) => ({
      id: event.id,
      eventId: event.eventId,
      eventType: event.eventType,
      status: event.status,
      receivedAt: normalizeDate(event.receivedAt) ?? new Date().toISOString(),
      processedAt: normalizeDate(event.processedAt),
      retryCount: event.retryCount,
      lastError: event.lastError,
    })),
  };
}

export function sanitizeProcessorConfigInput(input: Record<string, unknown>) {
  const provider = normalizeKey(String(input.provider ?? "STRIPE"), PAYMENT_PROCESSOR_PROVIDERS, "STRIPE");
  const area = normalizeKey(String(input.area ?? "MEMBERSHIP_SUBSCRIPTIONS"), PAYMENT_PROCESSOR_AREAS, "MEMBERSHIP_SUBSCRIPTIONS");
  const mode = normalizeKey(String(input.mode ?? "SANDBOX"), PAYMENT_PROCESSOR_MODES, "SANDBOX");
  const enabledFlows = Array.isArray(input.enabledFlows) ? input.enabledFlows.map((flow) => String(flow).trim()).filter(Boolean) : [];
  const withdrawalBatchSchedule = Array.isArray(input.withdrawalBatchSchedule)
    ? input.withdrawalBatchSchedule.map((day) => String(day).trim().toUpperCase()).filter(Boolean)
    : ["TUESDAY", "THURSDAY", "SATURDAY"];
  const publicKeyLabel = String(input.publicKeyLabel ?? "").trim() || null;
  const publicKeyFingerprint = fingerprintPublicKey(String(input.publicKeyFingerprint ?? input.publicKeyLabel ?? "").trim() || null);
  const secretEnvVarName = String(input.secretEnvVarName ?? "").trim() || null;
  const webhookSecretEnvVarName = String(input.webhookSecretEnvVarName ?? "").trim() || null;
  const platformFeeBps = Math.max(0, Math.min(5000, Number.parseInt(String(input.platformFeeBps ?? "0"), 10) || 0));

  return {
    provider,
    area,
    mode,
    displayName: String(input.displayName ?? `${provider} ${area}`).trim().slice(0, 120),
    publicKeyLabel,
    publicKeyFingerprint,
    secretEnvVarName,
    webhookSecretEnvVarName,
    secretConfigured: readEnvPresence(secretEnvVarName),
    webhookSecretConfigured: readEnvPresence(webhookSecretEnvVarName),
    enabledFlowsJson: JSON.stringify(enabledFlows),
    platformFeeBps,
    withdrawalBatchScheduleJson: JSON.stringify(withdrawalBatchSchedule),
    processorAccountStatus: String(input.processorAccountStatus ?? "").trim() || null,
    webhookHealthStatus: String(input.webhookHealthStatus ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN",
    metadataJson: String(input.metadataJson ?? "").trim() || null,
    isEnabled: Boolean(input.isEnabled),
  };
}

export async function seedDefaultStripeProcessorConfigs(actorUserId?: string | null) {
  const defaults = PAYMENT_PROCESSOR_AREAS.map((area) => ({
    provider: "STRIPE",
    area,
    mode: "SANDBOX",
    displayName: `Stripe ${area.toLowerCase().replaceAll("_", " ")}`,
    publicKeyLabel: "STRIPE_PUBLISHABLE_KEY",
    publicKeyFingerprint: fingerprintPublicKey(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    secretEnvVarName: "STRIPE_SECRET_KEY",
    webhookSecretEnvVarName: "STRIPE_WEBHOOK_SECRET",
    secretConfigured: readEnvPresence("STRIPE_SECRET_KEY"),
    webhookSecretConfigured: readEnvPresence("STRIPE_WEBHOOK_SECRET"),
    enabledFlowsJson: JSON.stringify([area]),
    platformFeeBps: area === "PLATFORM_FEES" ? 500 : 0,
    withdrawalBatchScheduleJson: JSON.stringify(["TUESDAY", "THURSDAY", "SATURDAY"]),
    processorAccountStatus: readEnvPresence("STRIPE_SECRET_KEY") ? "CONFIGURED" : "MISSING_SECRET",
    webhookHealthStatus: readEnvPresence("STRIPE_WEBHOOK_SECRET") ? "READY" : "MISSING_WEBHOOK_SECRET",
    isEnabled: false,
    updatedById: actorUserId ?? null,
  }));

  for (const config of defaults) {
    await prisma.paymentProcessorConfig.upsert({
      where: { provider_area_mode: { provider: config.provider, area: config.area, mode: config.mode } },
      create: config,
      update: {
        secretConfigured: config.secretConfigured,
        webhookSecretConfigured: config.webhookSecretConfigured,
        processorAccountStatus: config.processorAccountStatus,
        webhookHealthStatus: config.webhookHealthStatus,
      },
    });
  }
}
