import "./load-next-env";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type CheckStatus = "pass" | "warn" | "fail";

type ServiceCheck = {
  service: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

const repoRoot = process.cwd();
const outputPath = path.join(repoRoot, "docs", "external-services-readiness.md");

function run(command: string, args: string[], cwd = repoRoot) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function safeRun(command: string, args: string[], fallback = "unavailable") {
  try {
    return run(command, args);
  } catch {
    return fallback;
  }
}

function check(service: string, label: string, status: CheckStatus, detail: string): ServiceCheck {
  return { service, label, status, detail };
}

function envPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

function envUrlHost(name: string) {
  const value = process.env[name];
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function statusIcon(status: CheckStatus) {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WARN";
  return "FAIL";
}

function markdownTable(checks: ServiceCheck[]) {
  return [
    "| Service | Status | Check | Detail |",
    "| --- | --- | --- | --- |",
    ...checks.map((item) => `| ${item.service} | ${statusIcon(item.status)} | ${item.label} | ${item.detail.replace(/\|/g, "\\|")} |`)
  ].join("\n");
}

function bulletList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- none";
}

function findRailwayCli() {
  const railwayCmdPath = safeRun("cmd.exe", ["/c", "where railway.cmd"], "");
  if (railwayCmdPath) {
    const version = safeRun("cmd.exe", ["/c", "railway.cmd --version"], "installed but version unavailable");
    return { found: true, command: "railway.cmd", detail: version };
  }

  const railwayPath = safeRun("cmd.exe", ["/c", "where railway"], "");
  if (railwayPath) {
    return {
      found: false,
      command: "railway",
      detail: "railway shim exists, but PowerShell may block the ps1 wrapper. Prefer railway.cmd on Windows."
    };
  }

  return { found: false, command: "railway.cmd", detail: "Railway CLI was not found on PATH." };
}

function getGitCommit() {
  return safeRun("git", ["rev-parse", "--short", "HEAD"], "unknown");
}

function getGitFullCommit() {
  return safeRun("git", ["rev-parse", "HEAD"], "unknown");
}

function getGitStatus() {
  return safeRun("git", ["status", "--porcelain"], "");
}

const railwayCli = findRailwayCli();
const railwayLinkExists = existsSync(path.join(repoRoot, ".railway")) || existsSync(path.join(repoRoot, "railway.json"));
const databaseHost = envUrlHost("DATABASE_URL");
const nextAuthUrlHost = envUrlHost("NEXTAUTH_URL");
const r2PublicHost = envUrlHost("CLOUDFLARE_R2_PUBLIC_BASE_URL");
const r2Required = [
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
  "CLOUDFLARE_R2_PUBLIC_BASE_URL"
];
const missingR2 = r2Required.filter((name) => !envPresent(name));
const stripeRequired = [
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_CONTRIBUTOR",
  "STRIPE_PRICE_PROFESSIONAL",
  "STRIPE_PRICE_AUDITOR",
  "STRIPE_PRICE_ORG"
];
const missingStripe = stripeRequired.filter((name) => !envPresent(name));
const requiredRuntimeEnv = ["DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL"];
const missingRuntimeEnv = requiredRuntimeEnv.filter((name) => !envPresent(name));
const gitStatus = getGitStatus();

const checks: ServiceCheck[] = [
  check(
    "Railway",
    "CLI availability",
    railwayCli.found ? "pass" : "warn",
    railwayCli.found ? `${railwayCli.command} is available: ${railwayCli.detail}` : railwayCli.detail
  ),
  check(
    "Railway",
    "Local project link",
    railwayLinkExists ? "pass" : "warn",
    railwayLinkExists
      ? "A local Railway link/config file exists."
      : "No .railway directory or railway.json found in NewRepo. Production may still deploy from GitHub, but local CLI context is not linked here."
  ),
  check(
    "Neon",
    "DATABASE_URL presence",
    envPresent("DATABASE_URL") ? "pass" : "fail",
    envPresent("DATABASE_URL") ? `DATABASE_URL is present. Host: ${databaseHost ?? "unparseable"}.` : "DATABASE_URL is missing."
  ),
  check(
    "Neon",
    "PostgreSQL URL shape",
    process.env.DATABASE_URL?.startsWith("postgresql://") || process.env.DATABASE_URL?.startsWith("postgres://") ? "pass" : "fail",
    "DATABASE_URL must be PostgreSQL for Neon; SQLite/file URLs are not valid for production."
  ),
  check(
    "Neon",
    "Neon host hint",
    databaseHost?.includes("neon.tech") ? "pass" : "warn",
    databaseHost ? `Current host is ${databaseHost}.` : "No database host available."
  ),
  check(
    "Cloudflare R2",
    "Required media env",
    missingR2.length === 0 ? "pass" : "warn",
    missingR2.length === 0 ? "All R2 env variable names are present." : `Missing locally: ${missingR2.join(", ")}.`
  ),
  check(
    "Cloudflare R2",
    "Public media URL",
    r2PublicHost ? "pass" : "warn",
    r2PublicHost ? `Public media host: ${r2PublicHost}.` : "CLOUDFLARE_R2_PUBLIC_BASE_URL is missing or invalid."
  ),
  check(
    "Stripe",
    "Subscription env",
    missingStripe.length === 0 ? "pass" : "warn",
    missingStripe.length === 0 ? "All Stripe subscription variable names are present." : `Missing locally: ${missingStripe.join(", ")}.`
  ),
  check(
    "Stripe",
    "Webhook endpoint",
    "pass",
    "Expected production endpoint: https://theta-space.net/api/billing/stripe/webhook."
  ),
  check(
    "Auth",
    "Runtime auth env",
    missingRuntimeEnv.length === 0 ? "pass" : "warn",
    missingRuntimeEnv.length === 0 ? "DATABASE_URL, NEXTAUTH_SECRET, and NEXTAUTH_URL are present." : `Missing locally: ${missingRuntimeEnv.join(", ")}.`
  ),
  check(
    "Auth",
    "NEXTAUTH_URL host",
    nextAuthUrlHost?.includes("theta-space.net") ? "pass" : "warn",
    nextAuthUrlHost ? `NEXTAUTH_URL host: ${nextAuthUrlHost}.` : "NEXTAUTH_URL is missing or invalid."
  ),
  check(
    "NewRepo",
    "Worktree",
    gitStatus ? "warn" : "pass",
    gitStatus ? "NewRepo has uncommitted changes while generating this report." : "NewRepo was clean when this report was generated."
  )
];

const warnings = checks.filter((item) => item.status === "warn");
const failures = checks.filter((item) => item.status === "fail");
const passes = checks.filter((item) => item.status === "pass");

const content = `# Theta-Space External Services Readiness

Generated: ${new Date().toISOString()}

## Purpose

Read-only readiness report for the external services used by Theta-Space:

- Railway for the web application runtime.
- Neon.tech for PostgreSQL.
- Cloudflare R2 for media storage.
- Stripe for paid subscription checkout and subscription webhooks.

This report does not deploy Railway, connect to Neon, upload to R2, contact Stripe, mutate environment variables, or push GitHub.

## Source

- Repo: \`${repoRoot}\`
- Commit: \`${getGitCommit()}\`
- Full commit: \`${getGitFullCommit()}\`
- Worktree: ${gitStatus ? "dirty when report was generated" : "clean when report was generated"}

## Summary

- Passed: ${passes.length}
- Warnings: ${warnings.length}
- Failed: ${failures.length}

${markdownTable(checks)}

## Required Production Variables

These variable names must exist in Railway production:

${bulletList([...requiredRuntimeEnv, ...r2Required, ...stripeRequired, "PLATFORM_LOG_LEVEL", "DIAGNOSTIC_LOGS_ENABLED", "AUDIT_LOGS_ENABLED"].map((name) => `\`${name}\``))}

## Manual Railway Smoke

- Confirm Railway service is linked to GitHub \`Santroy8808/circlenest\`.
- Confirm production branch is \`main\`.
- Confirm deployment starts after production GitHub push.
- Confirm build logs run \`prisma generate\` and \`next build\`.
- Confirm runtime logs do not show server-side exception digests after login.

## Manual Neon Smoke

- Confirm \`DATABASE_URL\` points to Neon PostgreSQL, not SQLite or local Postgres.
- Confirm migrations are reviewed before deployment.
- Confirm \`npx prisma migrate status\` is clean against the production connection string.
- Confirm backup/restore posture before schema-changing releases.
- Confirm login smoke users exist and are preverified after any seed/purge plan.

## Manual R2 Smoke

- Confirm R2 bucket name matches \`CLOUDFLARE_R2_BUCKET\`.
- Confirm CORS allows browser PUT uploads from \`theta-space.net\`.
- Confirm signed upload intent returns a URL.
- Confirm direct browser upload writes the object to R2.
- Confirm complete-upload stores the DB record.
- Confirm public URL renders the image after refresh.

## Manual Stripe Smoke

- Confirm Railway has all Stripe variables listed above.
- Confirm Stripe has active recurring prices for Contributor, Professional, Auditor, and Org.
- Confirm Stripe webhook endpoint points to \`https://theta-space.net/api/billing/stripe/webhook\`.
- Confirm webhook events include \`checkout.session.completed\`, \`customer.subscription.updated\`, and \`customer.subscription.deleted\`.
- Confirm \`/settings/subscription\` starts Stripe checkout for a configured paid tier.
- Confirm a completed checkout updates \`Membership.subscriptionStatus\`, \`stripeCustomerId\`, \`stripeSubscriptionId\`, and active membership tier in Neon.
- Confirm canceled or unpaid subscriptions downgrade effective access instead of leaving paid access active.

## Warnings

${bulletList(warnings.map((item) => `${item.service} / ${item.label}: ${item.detail}`))}

## Failures

${bulletList(failures.map((item) => `${item.service} / ${item.label}: ${item.detail}`))}

## Cutover Boundary

- Resolve failures before production promotion.
- Explain or resolve warnings before production promotion.
- Do not use this report as approval to deploy.
- Re-run after Railway is linked or environment variables change.
`;

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, content, "utf8");

console.info(`External services readiness written to ${outputPath}`);
console.info(`Summary: ${passes.length} passed, ${warnings.length} warnings, ${failures.length} failed.`);
for (const item of [...warnings, ...failures]) {
  console.info(`- [${item.status.toUpperCase()}] ${item.service} / ${item.label}: ${item.detail}`);
}
