import "./load-next-env";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type CheckStatus = "pass" | "local-warning" | "production-blocker" | "manual";

type ServiceCheck = {
  service: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

const repoRoot = process.cwd();
const outputPath = path.join(repoRoot, "docs", "external-services-readiness.md");
const productionInspection = process.argv.slice(2).includes("--production");
const placeholderSecretPattern = /(change[-_ ]?me|example|placeholder|replace[-_ ]?with|your[-_ ]?secret)/i;

function run(command: string, args: string[]) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function safeRun(command: string, args: string[]) {
  try {
    return run(command, args);
  } catch {
    return "";
  }
}

function commandAvailable(command: string) {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  return Boolean(safeRun(lookup, [command]));
}

function check(service: string, label: string, status: CheckStatus, detail: string): ServiceCheck {
  return { service, label, status, detail };
}

function envValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

function envPresent(name: string) {
  return Boolean(envValue(name));
}

function missingNames(names: readonly string[]) {
  return names.filter((name) => !envPresent(name));
}

function firstEnvironmentValue(names: readonly string[]) {
  for (const name of names) {
    const value = envValue(name);
    if (value) return value;
  }
  return "";
}

function requiredStatus(condition: boolean): CheckStatus {
  if (condition) return "pass";
  return productionInspection ? "production-blocker" : "local-warning";
}

function isPostgreSqlUrl(value: string) {
  return /^postgres(?:ql)?:\/\//i.test(value);
}

function secureOrigin(name: string) {
  const value = envValue(name);
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function secureUrlFromAliases(names: readonly string[]) {
  const value = firstEnvironmentValue(names);
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function acceptableSecret(name: string) {
  const value = envValue(name);
  return value.length >= 32 && !placeholderSecretPattern.test(value) && new Set(value).size >= 10;
}

function distinctValues(names: readonly string[]) {
  const values = names.map((name) => envValue(name)).filter(Boolean);
  return values.length === names.length && new Set(values).size === names.length;
}

function valuesMatchPrefixes(requirements: ReadonlyArray<readonly [string, string]>) {
  return requirements.every(([name, prefix]) => envValue(name).startsWith(prefix));
}

function statusLabel(status: CheckStatus) {
  if (status === "pass") return "PASS";
  if (status === "local-warning") return "LOCAL WARN";
  if (status === "production-blocker") return "PROD BLOCKER";
  return "MANUAL GATE";
}

function markdownTable(checks: ServiceCheck[]) {
  return [
    "| Service | Result | Check | Detail |",
    "| --- | --- | --- | --- |",
    ...checks.map((item) => `| ${item.service} | ${statusLabel(item.status)} | ${item.label} | ${item.detail.replace(/\|/g, "\\|")} |`)
  ].join("\n");
}

function bulletList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- none";
}

function leakedEnvironmentValueNames(content: string, names: readonly string[]) {
  return names.filter((name) => {
    const value = envValue(name);
    return value.length >= 8 && content.includes(value);
  });
}

function getGitCommit() {
  return safeRun("git", ["rev-parse", "--short", "HEAD"]) || "unknown";
}

const databaseUrlPresent = envPresent("DATABASE_URL");
const databaseUrlIsPostgres = databaseUrlPresent && isPostgreSqlUrl(envValue("DATABASE_URL"));
const appOrigin = secureOrigin("APP_ORIGIN");
const nextAuthOrigin = secureOrigin("NEXTAUTH_URL");
const requiredSecrets = ["NEXTAUTH_SECRET", "MOBILE_AUTH_SECRET", "IP_HASH_SECRET"] as const;
const secretsMeetPolicy = requiredSecrets.every((name) => acceptableSecret(name));
const secretsAreDistinct = distinctValues(requiredSecrets);

const smtpRequired = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const;
const missingSmtp = missingNames(smtpRequired);
const smtpPort = Number(envValue("SMTP_PORT"));
const smtpShapeValid =
  missingSmtp.length === 0 && Number.isInteger(smtpPort) && smtpPort >= 1 && smtpPort <= 65535 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(envValue("SMTP_FROM"));

const r2ProviderAliases = ["CLOUDFLARE_R2_ACCOUNT_ID", "R2_ACCOUNT_ID", "CLOUDFLARE_R2_ENDPOINT", "R2_ENDPOINT"] as const;
const r2AccessKeyAliases = ["CLOUDFLARE_R2_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID"] as const;
const r2SecretKeyAliases = ["CLOUDFLARE_R2_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY"] as const;
const r2PublicBucketAliases = ["CLOUDFLARE_R2_BUCKET", "R2_BUCKET"] as const;
const r2PrivateBucketAliases = ["CLOUDFLARE_R2_PRIVATE_BUCKET", "R2_PRIVATE_BUCKET"] as const;
const r2PublicUrlAliases = ["CLOUDFLARE_R2_PUBLIC_BASE_URL", "R2_PUBLIC_BASE_URL"] as const;
const r2ProviderPresent = Boolean(firstEnvironmentValue(r2ProviderAliases));
const r2AccessKeyPresent = Boolean(firstEnvironmentValue(r2AccessKeyAliases));
const r2SecretKeyPresent = Boolean(firstEnvironmentValue(r2SecretKeyAliases));
const r2PublicBucket = firstEnvironmentValue(r2PublicBucketAliases);
const r2PrivateBucket = firstEnvironmentValue(r2PrivateBucketAliases);
const r2CorePresent = Boolean(r2ProviderPresent && r2AccessKeyPresent && r2SecretKeyPresent && r2PublicBucket && r2PrivateBucket);
const r2BucketsDistinct = Boolean(r2PublicBucket && r2PrivateBucket && r2PublicBucket !== r2PrivateBucket);
const r2PublicUrlValid = secureUrlFromAliases(r2PublicUrlAliases);

const stripeRequired = [
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_CONTRIBUTOR",
  "STRIPE_PRICE_PROFESSIONAL",
  "STRIPE_PRICE_AUDITOR",
  "STRIPE_PRICE_ORG"
] as const;
const missingStripe = missingNames(stripeRequired);
const stripeShapeValid =
  missingStripe.length === 0 &&
  valuesMatchPrefixes([
    ["STRIPE_PUBLISHABLE_KEY", "pk_"],
    ["STRIPE_SECRET_KEY", "sk_"],
    ["STRIPE_WEBHOOK_SECRET", "whsec_"],
    ["STRIPE_PRICE_CONTRIBUTOR", "price_"],
    ["STRIPE_PRICE_PROFESSIONAL", "price_"],
    ["STRIPE_PRICE_AUDITOR", "price_"],
    ["STRIPE_PRICE_ORG", "price_"]
  ]);

const gitOrigin = safeRun("git", ["remote", "get-url", "origin"]);
const githubOrigin = /github\.com(?::|\/)/i.test(gitOrigin);
const gitWorktreeDirty = Boolean(safeRun("git", ["status", "--porcelain"]));
const caddyAvailable = commandAvailable("caddy");
const runningOnWindows = process.platform === "win32";
const trustedProxyValue = envValue("TRUSTED_PROXY_HOPS");
const trustedProxyReady = !trustedProxyValue || trustedProxyValue === "1";

const checks: ServiceCheck[] = [
  check(
    "Windows / Caddy",
    "Inspection platform",
    requiredStatus(runningOnWindows),
    runningOnWindows
      ? "The local inspection is running on Windows. Production Windows Server version and patch state still require manual confirmation."
      : "The local inspection is not running on Windows; this does not describe the production Windows Server host."
  ),
  check(
    "Windows / Caddy",
    "Caddy CLI availability",
    requiredStatus(caddyAvailable),
    caddyAvailable
      ? "Caddy is available on the local PATH. No configuration or running service was contacted."
      : "Caddy is not on the local PATH. Confirm it and its service state directly on production."
  ),
  check(
    "GitHub",
    "Origin provider",
    requiredStatus(githubOrigin),
    githubOrigin ? "The local origin is a GitHub remote; its URL is intentionally redacted." : "The local origin is absent or is not recognized as GitHub."
  ),
  check(
    "PostgreSQL",
    "DATABASE_URL presence",
    requiredStatus(databaseUrlPresent),
    databaseUrlPresent ? "DATABASE_URL is present; its value and host are intentionally redacted." : "DATABASE_URL is not configured in the loaded environment."
  ),
  check(
    "PostgreSQL",
    "Connection scheme",
    requiredStatus(databaseUrlIsPostgres),
    databaseUrlIsPostgres
      ? "DATABASE_URL uses a PostgreSQL scheme. No database connection was attempted."
      : "DATABASE_URL must use postgresql:// or postgres://; no provider is assumed."
  ),
  check(
    "Auth / Proxy",
    "HTTPS application origins",
    requiredStatus(Boolean(appOrigin && nextAuthOrigin)),
    appOrigin && nextAuthOrigin
      ? "APP_ORIGIN and NEXTAUTH_URL are valid HTTPS origins without embedded credentials; values are redacted."
      : "APP_ORIGIN and NEXTAUTH_URL must both be HTTPS origins without embedded credentials in production."
  ),
  check(
    "Auth / Proxy",
    "Origin agreement",
    requiredStatus(Boolean(appOrigin && nextAuthOrigin && appOrigin === nextAuthOrigin)),
    appOrigin && nextAuthOrigin && appOrigin === nextAuthOrigin
      ? "APP_ORIGIN and NEXTAUTH_URL resolve to the same origin."
      : "APP_ORIGIN and NEXTAUTH_URL must resolve to the same production origin."
  ),
  check(
    "Auth / Proxy",
    "Independent application secrets",
    requiredStatus(secretsMeetPolicy && secretsAreDistinct),
    secretsMeetPolicy && secretsAreDistinct
      ? "NEXTAUTH_SECRET, MOBILE_AUTH_SECRET, and IP_HASH_SECRET satisfy the production quality policy and are distinct; values and lengths are redacted."
      : "NEXTAUTH_SECRET, MOBILE_AUTH_SECRET, and IP_HASH_SECRET must each be non-placeholder, high-entropy, at least 32 characters, and mutually distinct."
  ),
  check(
    "Auth / Proxy",
    "Production safety flags",
    requiredStatus(envValue("AUTH_SIGNUP_PREVERIFIED") !== "true" && envValue("UPLOAD_PROXY_FALLBACK_ENABLED") !== "true"),
    envValue("AUTH_SIGNUP_PREVERIFIED") !== "true" && envValue("UPLOAD_PROXY_FALLBACK_ENABLED") !== "true"
      ? "Signup preverification and buffered upload fallback are not enabled."
      : "AUTH_SIGNUP_PREVERIFIED and UPLOAD_PROXY_FALLBACK_ENABLED must not be true in production."
  ),
  check(
    "Auth / Proxy",
    "Caddy proxy hop policy",
    requiredStatus(trustedProxyReady),
    trustedProxyReady
      ? "TRUSTED_PROXY_HOPS is absent (safe default) or configured for the single Caddy proxy hop; the value is redacted."
      : "TRUSTED_PROXY_HOPS does not match the expected single Caddy reverse-proxy hop."
  ),
  check(
    "SMTP",
    "Account recovery configuration",
    requiredStatus(smtpShapeValid),
    smtpShapeValid
      ? "All required SMTP variable names are present and basic port/from-address validation passed; values are redacted."
      : `SMTP recovery configuration is incomplete or invalid. Required names: ${smtpRequired.join(", ")}.`
  ),
  check(
    "SMTP",
    "TLS policy",
    requiredStatus(envValue("SMTP_IGNORE_TLS") !== "true"),
    envValue("SMTP_IGNORE_TLS") !== "true" ? "SMTP_IGNORE_TLS is not enabled." : "SMTP_IGNORE_TLS must not be true in production."
  ),
  check(
    "Cloudflare R2",
    "Public and private storage configuration",
    requiredStatus(r2CorePresent),
    r2CorePresent
      ? "R2 provider/endpoint, credentials, and both bucket roles are configured; all values are redacted."
      : "R2 provider/endpoint, credentials, public bucket, and private bucket are all required in production."
  ),
  check(
    "Cloudflare R2",
    "Bucket separation",
    requiredStatus(r2BucketsDistinct),
    r2BucketsDistinct
      ? "The configured public and private bucket names are distinct; names are redacted."
      : "The public and private R2 bucket names must both exist and must not be equal."
  ),
  check(
    "Cloudflare R2",
    "Public media base URL",
    requiredStatus(r2PublicUrlValid),
    r2PublicUrlValid
      ? "The public media base is a credential-free HTTPS URL; the value is redacted."
      : "CLOUDFLARE_R2_PUBLIC_BASE_URL (or R2_PUBLIC_BASE_URL) must be a credential-free HTTPS URL."
  ),
  check(
    "Stripe",
    "Environment fallback configuration",
    requiredStatus(missingStripe.length === 0 && stripeShapeValid),
    missingStripe.length === 0 && stripeShapeValid
      ? "All Stripe fallback variables have recognized key/price prefixes; values are redacted."
      : "Stripe environment fallbacks are incomplete or malformed. Production mode fails closed because this report cannot verify secured admin-managed configuration."
  ),
  check(
    "Windows / Caddy",
    "Production service and TLS",
    "manual",
    "Confirm the Windows service, Caddy configuration, firewall, loopback binding, HTTPS certificate, health routes, and restart-after-reboot behavior on the server."
  ),
  check(
    "Cloudflare R2",
    "Media privacy enforcement",
    "manual",
    "Run the public-versus-private media smoke below; configuration presence cannot prove object privacy."
  ),
  check(
    "Stripe",
    "Live checkout and webhook",
    "manual",
    "Confirm live-mode alignment, webhook delivery, checkout completion, idempotency, and downgrade behavior without exposing credentials."
  ),
  check(
    "Repository",
    "Worktree",
    requiredStatus(!gitWorktreeDirty),
    gitWorktreeDirty ? "The worktree has uncommitted changes; file names are intentionally omitted." : "The worktree was clean when this report was generated."
  )
];

const localWarnings = checks.filter((item) => item.status === "local-warning");
const productionBlockers = checks.filter((item) => item.status === "production-blocker");
const manualGates = checks.filter((item) => item.status === "manual");
const passes = checks.filter((item) => item.status === "pass");

const coreProductionVariables = [
  "DATABASE_URL",
  "APP_ORIGIN",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "MOBILE_AUTH_SECRET",
  "IP_HASH_SECRET",
  "TRUSTED_PROXY_HOPS"
];
const canonicalR2Variables = [
  "CLOUDFLARE_R2_ACCOUNT_ID or CLOUDFLARE_R2_ENDPOINT",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
  "CLOUDFLARE_R2_PRIVATE_BUCKET",
  "CLOUDFLARE_R2_PUBLIC_BASE_URL"
];
const productionSafetyVariables = [
  "AUTH_SIGNUP_PREVERIFIED=false",
  "UPLOAD_PROXY_FALLBACK_ENABLED=false",
  "SMTP_IGNORE_TLS=false",
  "PLATFORM_LOG_LEVEL",
  "DIAGNOSTIC_LOGS_ENABLED",
  "AUDIT_LOGS_ENABLED"
];
const protectedReportValues = [
  "DATABASE_URL",
  "APP_ORIGIN",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "MOBILE_AUTH_SECRET",
  "IP_HASH_SECRET",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  ...r2ProviderAliases,
  ...r2AccessKeyAliases,
  ...r2SecretKeyAliases,
  ...r2PublicBucketAliases,
  ...r2PrivateBucketAliases,
  ...r2PublicUrlAliases,
  ...stripeRequired
] as const;

const content = `# Theta-Space External Services Readiness

Generated: ${new Date().toISOString()}

## Purpose and safety

Read-only external-service readiness report for the current production topology:

- GitHub is the source used to update the production checkout.
- The application runs on Windows Server behind Caddy on a loopback application port.
- PostgreSQL is required, without assuming any particular hosting provider.
- Cloudflare R2 uses separate public and private buckets.
- SMTP supports account recovery; auth, mobile, and IP-hash secrets protect separate trust boundaries.
- Stripe supports subscription checkout and webhooks.

The script only reads the loaded environment and local Git/tool availability, then rewrites this report. It does not connect to PostgreSQL, Caddy, R2, SMTP, Stripe, GitHub APIs, or the production server. It never prints environment values, parsed hosts, credentials, bucket names, secret lengths, or key prefixes.

## Inspection context

- Repository: **${path.basename(repoRoot)}**
- Commit: **${getGitCommit()}**
- Inspection mode: ${productionInspection ? "explicit production validation" : "local advisory"}
- Worktree: ${gitWorktreeDirty ? "dirty; changed file names redacted" : "clean"}

${
  productionInspection
    ? "**Production validation is fail-closed: every failed automated production requirement is a production blocker and causes a nonzero exit. Manual gates still require recorded human evidence.**"
    : "**This local advisory report is not production sign-off. Run `npm run services:readiness -- --production` against the protected production environment for fail-closed validation.**"
}

## Result meanings

- **PASS**: the loaded environment or local metadata satisfies the automated check.
- **LOCAL WARN**: the local developer environment is incomplete or differs from production. This alone does not prove a production outage or blocker.
- **PROD BLOCKER**: an automated production requirement failed while the script was running with the explicit **--production** flag.
- **MANUAL GATE**: the condition cannot be proven without inspecting or exercising production. It must be completed before promotion.

## Summary

- Passed: ${passes.length}
- Local warnings: ${localWarnings.length}
- Production blockers: ${productionBlockers.length}
- Manual gates: ${manualGates.length}

${markdownTable(checks)}

## Required production variable names

### Runtime, database, auth, and proxy

${bulletList(coreProductionVariables.map((name) => `\`${name}\``))}

The three secrets must each satisfy the production quality policy and must be mutually distinct. Do not copy one secret into another variable.

### SMTP recovery

${bulletList([...smtpRequired, "SMTP_SECURE", "SMTP_IGNORE_TLS=false"].map((name) => `\`${name}\``))}

### Cloudflare R2

${bulletList(canonicalR2Variables.map((name) => `\`${name}\``))}

The equivalent R2 aliases are accepted by the application. Prefer one naming family consistently. The private bucket must not equal the public bucket and must not have a public custom domain.

### Stripe

${bulletList(stripeRequired.map((name) => `\`${name}\``))}

Stripe secrets may instead be supplied through the secured admin-managed configuration. Readiness still requires one complete, internally consistent source and a manual live-mode check.

### Production safety and observability

${bulletList(productionSafetyVariables.map((name) => `\`${name}\``))}

## Manual Windows Server, Caddy, and GitHub smoke

- Confirm the production host is the intended patched Windows Server and the checkout is on the reviewed GitHub main commit.
- Confirm the application service runs under the intended least-privilege account, starts after reboot, and restarts cleanly after an approved update.
- Confirm the Node application binds only to the loopback application port and is not directly exposed by the public firewall.
- Run **caddy validate** against the server configuration, then confirm Caddy owns public ports 80/443 and reverse-proxies to the loopback application port.
- Confirm Caddy serves a valid certificate for the production hostname, redirects HTTP to HTTPS, and forwards the expected proxy headers exactly once.
- Confirm **TRUSTED_PROXY_HOPS** matches the single Caddy hop.
- Confirm both the direct loopback health route and the Caddy-fronted health route return success after restart.
- Confirm the server checkout has no unreviewed modifications and no environment/secrets file is tracked by Git.
- Do not push, pull, restart, or deploy as part of this report.

## Manual PostgreSQL smoke

- Confirm **DATABASE_URL** resolves to the intended production PostgreSQL database; do not infer the provider from the URL.
- Confirm transport encryption, network allow-listing, least-privilege credentials, connection limits, and timeout settings.
- Run the approved Prisma migration-status procedure before deployment; do not apply an unreviewed schema change.
- Confirm a recent restorable backup and document the restore owner before schema-changing releases.
- Confirm login, a representative read, and a reversible write against a designated smoke account after deployment.

## Manual public/private R2 media privacy smoke

- Confirm the public and private bucket names are different and that only the public bucket is attached to the public media domain.
- Confirm public-bucket CORS allows only the required production origins and methods; bucket listing remains disabled.
- Upload a public test image through the application, complete the upload, refresh, and confirm an anonymous browser can render its public URL.
- Upload a restricted test image through the application and confirm its object is written to the private bucket, not the public bucket.
- Attempt the private object through the public media hostname and anonymously against its storage URL; both attempts must fail with no object contents.
- Confirm an authorized signed-in viewer can retrieve the restricted image through the intended signed/application path.
- Confirm an anonymous viewer and a signed-in unauthorized viewer are both denied.
- Confirm copied or expired private-media URLs do not grant durable public access.
- Delete both smoke objects through the supported workflow and confirm storage plus database cleanup.

## Manual SMTP and auth smoke

- Confirm password-reset and verification messages reach a designated mailbox and that links use the production HTTPS origin.
- Confirm SMTP transport requires TLS, **SMTP_IGNORE_TLS** is false, and SPF/DKIM/DMARC posture is documented.
- Confirm reset tokens are single-use, expire as designed, and do not appear in application logs.
- Confirm **NEXTAUTH_SECRET**, **MOBILE_AUTH_SECRET**, and **IP_HASH_SECRET** are independently generated and stored only in the protected server environment.
- Confirm mobile authentication rejects tokens signed with an obsolete or incorrect secret.
- Confirm IP-derived audit identifiers remain pseudonymous and raw client IP addresses are not emitted by this report.
- Confirm signup preverification and buffered upload fallback remain disabled in production.

## Manual Stripe smoke

- Confirm publishable key, secret key, webhook secret, and all four recurring prices belong to the same intended Stripe mode and account.
- Confirm the production webhook endpoint uses the production HTTPS origin plus **/api/billing/stripe/webhook**.
- Confirm webhook subscriptions include **checkout.session.completed**, **customer.subscription.updated**, and **customer.subscription.deleted**.
- Confirm signature rejection, duplicate-event idempotency, and retry handling before accepting a live event.
- Start checkout for each paid tier, complete one designated smoke checkout, and confirm membership state changes exactly once.
- Confirm canceled, unpaid, or deleted subscriptions remove paid access without deleting unrelated account data.
- Redact customer identifiers, payloads, and all Stripe secrets from screenshots and handoff notes.

## Local warnings

${bulletList(localWarnings.map((item) => `${item.service} / ${item.label}: ${item.detail}`))}

## Production blockers

${bulletList(productionBlockers.map((item) => `${item.service} / ${item.label}: ${item.detail}`))}

## Manual gates

${bulletList(manualGates.map((item) => `${item.service} / ${item.label}: ${item.detail}`))}

## Promotion boundary

- The default command is local advisory only and is never production sign-off.
- Run **npm run services:readiness -- --production** against the protected production environment for fail-closed automated validation.
- Local warnings describe this loaded environment; verify them against protected production configuration rather than copying developer values.
- Resolve every production blocker before promotion.
- Complete every manual gate against the intended production host and service accounts.
- This report is evidence gathering, not approval to deploy.
- Re-run after environment, infrastructure, credentials, bucket policy, or Stripe configuration changes.
`;

const leakedValueNames = leakedEnvironmentValueNames(content, protectedReportValues);
if (leakedValueNames.length > 0) {
  throw new Error(`Refusing to write a report containing loaded values for: ${leakedValueNames.join(", ")}`);
}

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, content, "utf8");

console.info(`External services readiness written to ${outputPath}`);
console.info(
  `Summary: ${passes.length} passed, ${localWarnings.length} local warnings, ${productionBlockers.length} production blockers, ${manualGates.length} manual gates.`
);
console.info(
  productionInspection
    ? "Production validation mode is fail-closed; any production blocker returns a nonzero exit."
    : "Local advisory only; this is not production sign-off. Run: npm run services:readiness -- --production"
);
for (const item of [...localWarnings, ...productionBlockers]) {
  console.info(`- [${statusLabel(item.status)}] ${item.service} / ${item.label}: ${item.detail}`);
}

if (productionBlockers.length > 0) process.exitCode = 1;
