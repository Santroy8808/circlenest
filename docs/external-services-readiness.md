# Theta-Space External Services Readiness

Generated: 2026-07-16T19:50:59.258Z

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

- Repository: **circlenest**
- Commit: **64ae010**
- Inspection mode: local advisory
- Worktree: clean

**This local advisory report is not production sign-off. Run `npm run services:readiness -- --production` against the protected production environment for fail-closed validation.**

## Result meanings

- **PASS**: the loaded environment or local metadata satisfies the automated check.
- **LOCAL WARN**: the local developer environment is incomplete or differs from production. This alone does not prove a production outage or blocker.
- **PROD BLOCKER**: an automated production requirement failed while the script was running with the explicit **--production** flag.
- **MANUAL GATE**: the condition cannot be proven without inspecting or exercising production. It must be completed before promotion.

## Summary

- Passed: 16
- Local warnings: 1
- Production blockers: 0
- Manual gates: 3

| Service | Result | Check | Detail |
| --- | --- | --- | --- |
| Windows / Caddy | PASS | Inspection platform | The local inspection is running on Windows. Production Windows Server version and patch state still require manual confirmation. |
| Windows / Caddy | PASS | Caddy CLI availability | Caddy is available on the local PATH. No configuration or running service was contacted. |
| GitHub | PASS | Origin provider | The local origin is a GitHub remote; its URL is intentionally redacted. |
| PostgreSQL | PASS | DATABASE_URL presence | DATABASE_URL is present; its value and host are intentionally redacted. |
| PostgreSQL | PASS | Connection scheme | DATABASE_URL uses a PostgreSQL scheme. No database connection was attempted. |
| Auth / Proxy | PASS | HTTPS application origins | APP_ORIGIN and NEXTAUTH_URL are valid HTTPS origins without embedded credentials; values are redacted. |
| Auth / Proxy | PASS | Origin agreement | APP_ORIGIN and NEXTAUTH_URL resolve to the same origin. |
| Auth / Proxy | PASS | Independent application secrets | NEXTAUTH_SECRET, MOBILE_AUTH_SECRET, and IP_HASH_SECRET satisfy the production quality policy and are distinct; values and lengths are redacted. |
| Auth / Proxy | PASS | Production safety flags | Signup preverification and buffered upload fallback are not enabled. |
| Auth / Proxy | PASS | Caddy proxy hop policy | TRUSTED_PROXY_HOPS is absent (safe default) or configured for the single Caddy proxy hop; the value is redacted. |
| SMTP | PASS | Account recovery configuration | All required SMTP variable names are present and basic port/from-address validation passed; values are redacted. |
| SMTP | PASS | TLS policy | SMTP_IGNORE_TLS is not enabled. |
| Cloudflare R2 | PASS | Public and private storage configuration | R2 provider/endpoint, credentials, and both bucket roles are configured; all values are redacted. |
| Cloudflare R2 | PASS | Bucket separation | The configured public and private bucket names are distinct; names are redacted. |
| Cloudflare R2 | PASS | Public media base URL | The public media base is a credential-free HTTPS URL; the value is redacted. |
| Stripe | LOCAL WARN | Environment fallback configuration | Stripe environment fallbacks are incomplete or malformed. Production mode fails closed because this report cannot verify secured admin-managed configuration. |
| Windows / Caddy | MANUAL GATE | Production service and TLS | Confirm the Windows service, Caddy configuration, firewall, loopback binding, HTTPS certificate, health routes, and restart-after-reboot behavior on the server. |
| Cloudflare R2 | MANUAL GATE | Media privacy enforcement | Run the public-versus-private media smoke below; configuration presence cannot prove object privacy. |
| Stripe | MANUAL GATE | Live checkout and webhook | Confirm live-mode alignment, webhook delivery, checkout completion, idempotency, and downgrade behavior without exposing credentials. |
| Repository | PASS | Worktree | The worktree was clean when this report was generated. |

## Required production variable names

### Runtime, database, auth, and proxy

- `DATABASE_URL`
- `APP_ORIGIN`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `MOBILE_AUTH_SECRET`
- `IP_HASH_SECRET`
- `TRUSTED_PROXY_HOPS`

The three secrets must each satisfy the production quality policy and must be mutually distinct. Do not copy one secret into another variable.

### SMTP recovery

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `SMTP_SECURE`
- `SMTP_IGNORE_TLS=false`

### Cloudflare R2

- `CLOUDFLARE_R2_ACCOUNT_ID or CLOUDFLARE_R2_ENDPOINT`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET`
- `CLOUDFLARE_R2_PRIVATE_BUCKET`
- `CLOUDFLARE_R2_PUBLIC_BASE_URL`

The equivalent R2 aliases are accepted by the application. Prefer one naming family consistently. The private bucket must not equal the public bucket and must not have a public custom domain.

### Stripe

- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_CONTRIBUTOR`
- `STRIPE_PRICE_PROFESSIONAL`
- `STRIPE_PRICE_AUDITOR`
- `STRIPE_PRICE_ORG`

Stripe secrets may instead be supplied through the secured admin-managed configuration. Readiness still requires one complete, internally consistent source and a manual live-mode check.

### Production safety and observability

- `AUTH_SIGNUP_PREVERIFIED=false`
- `UPLOAD_PROXY_FALLBACK_ENABLED=false`
- `SMTP_IGNORE_TLS=false`
- `PLATFORM_LOG_LEVEL`
- `DIAGNOSTIC_LOGS_ENABLED`
- `AUDIT_LOGS_ENABLED`

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

- Stripe / Environment fallback configuration: Stripe environment fallbacks are incomplete or malformed. Production mode fails closed because this report cannot verify secured admin-managed configuration.

## Production blockers

- none

## Manual gates

- Windows / Caddy / Production service and TLS: Confirm the Windows service, Caddy configuration, firewall, loopback binding, HTTPS certificate, health routes, and restart-after-reboot behavior on the server.
- Cloudflare R2 / Media privacy enforcement: Run the public-versus-private media smoke below; configuration presence cannot prove object privacy.
- Stripe / Live checkout and webhook: Confirm live-mode alignment, webhook delivery, checkout completion, idempotency, and downgrade behavior without exposing credentials.

## Promotion boundary

- The default command is local advisory only and is never production sign-off.
- Run **npm run services:readiness -- --production** against the protected production environment for fail-closed automated validation.
- Local warnings describe this loaded environment; verify them against protected production configuration rather than copying developer values.
- Resolve every production blocker before promotion.
- Complete every manual gate against the intended production host and service accounts.
- This report is evidence gathering, not approval to deploy.
- Re-run after environment, infrastructure, credentials, bucket policy, or Stripe configuration changes.
