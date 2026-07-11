import { z } from "zod";

const optionalUrl = z.string().url().or(z.literal("")).optional();
const placeholderSecretPattern = /(change[-_ ]?me|example|placeholder|replace[-_ ]?with|your[-_ ]?secret)/i;

function isAcceptableProductionSecret(value: string | undefined) {
  return Boolean(
    value &&
      value.length >= 32 &&
      !placeholderSecretPattern.test(value) &&
      new Set(value).size >= 10
  );
}

function parseSecureOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(16).optional(),
  NEXTAUTH_URL: optionalUrl,
  APP_ORIGIN: optionalUrl,
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(8).default(1),
  AUTH_SIGNUP_PREVERIFIED: z.enum(["true", "false"]).default("false"),
  INTERNAL_MAIL_ENABLED: z.enum(["true", "false"]).default("false"),
  UPLOAD_PROXY_FALLBACK_ENABLED: z.enum(["true", "false"]).default("false"),
  MOBILE_AUTH_SECRET: z.string().min(32).optional(),
  IP_HASH_SECRET: z.string().min(32).optional(),
  PLATFORM_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PRISMA_QUERY_LOGS_ENABLED: z.enum(["true", "false"]).default("false"),
  PRISMA_SLOW_QUERY_MS: z.coerce.number().int().min(1).default(250),
  DIAGNOSTIC_LOGS_ENABLED: z.enum(["true", "false"]).default("true"),
  AUDIT_LOGS_ENABLED: z.enum(["true", "false"]).default("true"),
  APP_VERSION: z.string().optional(),
  NEXT_PUBLIC_BUILD_ID: z.string().optional(),
  RAILWAY_DEPLOYMENT_ID: z.string().optional(),
  RAILWAY_ENVIRONMENT_NAME: z.string().optional(),
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
  REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().optional(),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().optional(),
  CLOUDFLARE_R2_BUCKET: z.string().optional(),
  CLOUDFLARE_R2_PRIVATE_BUCKET: z.string().optional(),
  CLOUDFLARE_R2_ENDPOINT: optionalUrl,
  CLOUDFLARE_R2_PUBLIC_BASE_URL: optionalUrl,
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ENDPOINT: optionalUrl,
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PRIVATE_BUCKET: z.string().optional(),
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

export const productionEnvSchema = envSchema.superRefine((env, context) => {
  if (env.AUTH_SIGNUP_PREVERIFIED === "true") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "AUTH_SIGNUP_PREVERIFIED must not be enabled in production.",
      path: ["AUTH_SIGNUP_PREVERIFIED"]
    });
  }

  if (env.UPLOAD_PROXY_FALLBACK_ENABLED === "true") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "UPLOAD_PROXY_FALLBACK_ENABLED must remain disabled in production until uploads are streamed with a hard byte limit.",
      path: ["UPLOAD_PROXY_FALLBACK_ENABLED"]
    });
  }

  const requiredSecrets = [
    ["NEXTAUTH_SECRET", env.NEXTAUTH_SECRET],
    ["MOBILE_AUTH_SECRET", env.MOBILE_AUTH_SECRET],
    ["IP_HASH_SECRET", env.IP_HASH_SECRET]
  ] as const;

  for (const [name, value] of requiredSecrets) {
    if (!isAcceptableProductionSecret(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${name} must be a non-placeholder random secret with at least 32 characters in production.`,
        path: [name]
      });
    }
  }

  const distinctSecrets = new Set(requiredSecrets.map(([, value]) => value).filter(Boolean));
  if (distinctSecrets.size !== requiredSecrets.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "NEXTAUTH_SECRET, MOBILE_AUTH_SECRET, and IP_HASH_SECRET must be independent secrets.",
      path: ["NEXTAUTH_SECRET"]
    });
  }

  const appOrigin = parseSecureOrigin(env.APP_ORIGIN);
  const nextAuthOrigin = parseSecureOrigin(env.NEXTAUTH_URL);
  for (const [name, value] of [
    ["APP_ORIGIN", appOrigin],
    ["NEXTAUTH_URL", nextAuthOrigin]
  ] as const) {
    if (!value) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${name} must be an HTTPS origin without embedded credentials in production.`,
        path: [name]
      });
    }
  }

  if (appOrigin && nextAuthOrigin && appOrigin !== nextAuthOrigin) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "APP_ORIGIN and NEXTAUTH_URL must use the same origin in production.",
      path: ["APP_ORIGIN"]
    });
  }

  const smtpFields = [env.SMTP_HOST, env.SMTP_PORT, env.SMTP_USER, env.SMTP_PASS, env.SMTP_FROM];
  if (smtpFields.some((value) => !value)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM are required for production account recovery.",
      path: ["SMTP_HOST"]
    });
  }

  if (env.SMTP_IGNORE_TLS === "true") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SMTP_IGNORE_TLS must not be enabled in production.",
      path: ["SMTP_IGNORE_TLS"]
    });
  }

  const publicBucket = env.CLOUDFLARE_R2_BUCKET || env.R2_BUCKET;
  const privateBucket = env.CLOUDFLARE_R2_PRIVATE_BUCKET || env.R2_PRIVATE_BUCKET;
  const r2AccountOrEndpoint =
    env.CLOUDFLARE_R2_ACCOUNT_ID || env.R2_ACCOUNT_ID || env.CLOUDFLARE_R2_ENDPOINT || env.R2_ENDPOINT;
  const r2AccessKey = env.CLOUDFLARE_R2_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID;
  const r2SecretKey = env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY;
  if (!r2AccountOrEndpoint || !r2AccessKey || !r2SecretKey || !publicBucket) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "R2 endpoint/account, credentials, and public bucket are required for production media.",
      path: ["CLOUDFLARE_R2_BUCKET"]
    });
  }

  if (!privateBucket || privateBucket === publicBucket) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A distinct CLOUDFLARE_R2_PRIVATE_BUCKET (or R2_PRIVATE_BUCKET) is required for restricted media.",
      path: ["CLOUDFLARE_R2_PRIVATE_BUCKET"]
    });
  }
});

export type PlatformEnv = z.infer<typeof envSchema>;

export function readPlatformEnv(input: NodeJS.ProcessEnv = process.env): PlatformEnv {
  return (input.NODE_ENV === "production" ? productionEnvSchema : envSchema).parse(input);
}

export function safeReadPlatformEnv(input: NodeJS.ProcessEnv = process.env) {
  return (input.NODE_ENV === "production" ? productionEnvSchema : envSchema).safeParse(input);
}

export function safeReadProductionEnv(input: NodeJS.ProcessEnv = process.env) {
  return productionEnvSchema.safeParse(input);
}

export function isEnabled(value: string | undefined, fallback = true) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}
