import { z } from "zod";

const optionalUrl = z.string().url().or(z.literal("")).optional();

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(16).optional(),
  NEXTAUTH_URL: optionalUrl,
  PLATFORM_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DIAGNOSTIC_LOGS_ENABLED: z.enum(["true", "false"]).default("true"),
  AUDIT_LOGS_ENABLED: z.enum(["true", "false"]).default("true"),
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().optional(),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().optional(),
  CLOUDFLARE_R2_BUCKET: z.string().optional(),
  CLOUDFLARE_R2_ENDPOINT: optionalUrl,
  CLOUDFLARE_R2_PUBLIC_BASE_URL: optionalUrl,
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ENDPOINT: optionalUrl,
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: optionalUrl,
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  SMTP_SECURE: z.enum(["true", "false"]).optional(),
  SMTP_IGNORE_TLS: z.enum(["true", "false"]).optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_CONTRIBUTOR: z.string().optional(),
  STRIPE_PRICE_PROFESSIONAL: z.string().optional(),
  STRIPE_PRICE_AUDITOR: z.string().optional(),
  STRIPE_PRICE_ORG: z.string().optional()
});

export type PlatformEnv = z.infer<typeof envSchema>;

export function readPlatformEnv(input: NodeJS.ProcessEnv = process.env): PlatformEnv {
  return envSchema.parse(input);
}

export function safeReadPlatformEnv(input: NodeJS.ProcessEnv = process.env) {
  return envSchema.safeParse(input);
}

export function isEnabled(value: string | undefined, fallback = true) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}
