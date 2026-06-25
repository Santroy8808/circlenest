# Theta-Space External Services Readiness

Generated: 2026-06-25T11:21:10.238Z

## Purpose

Read-only readiness report for the external services used by Theta-Space:

- Railway for the web application runtime.
- Neon.tech for PostgreSQL.
- Cloudflare R2 for media storage.
- Stripe for paid subscription checkout and subscription webhooks.

This report does not deploy Railway, connect to Neon, upload to R2, contact Stripe, mutate environment variables, or push GitHub.

## Source

- Repo: `C:\Repos\Theta-Space-net\NewRepo`
- Commit: `19a3a6d`
- Full commit: `19a3a6deb883fa03b9a732d72e23526c69e9b2ca`
- Worktree: dirty when report was generated

## Summary

- Passed: 5
- Warnings: 7
- Failed: 0

| Service | Status | Check | Detail |
| --- | --- | --- | --- |
| Railway | PASS | CLI availability | railway.cmd is available: railway 5.8.0 |
| Railway | WARN | Local project link | No .railway directory or railway.json found in NewRepo. Production may still deploy from GitHub, but local CLI context is not linked here. |
| Neon | PASS | DATABASE_URL presence | DATABASE_URL is present. Host: localhost:5432. |
| Neon | PASS | PostgreSQL URL shape | DATABASE_URL must be PostgreSQL for Neon; SQLite/file URLs are not valid for production. |
| Neon | WARN | Neon host hint | Current host is localhost:5432. |
| Cloudflare R2 | WARN | Required media env | Missing locally: CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET, CLOUDFLARE_R2_PUBLIC_BASE_URL. |
| Cloudflare R2 | WARN | Public media URL | CLOUDFLARE_R2_PUBLIC_BASE_URL is missing or invalid. |
| Stripe | WARN | Subscription env | Missing locally: STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_CONTRIBUTOR, STRIPE_PRICE_PROFESSIONAL, STRIPE_PRICE_AUDITOR, STRIPE_PRICE_ORG. |
| Stripe | PASS | Webhook endpoint | Expected production endpoint: https://theta-space.net/api/billing/stripe/webhook. |
| Auth | PASS | Runtime auth env | DATABASE_URL, NEXTAUTH_SECRET, and NEXTAUTH_URL are present. |
| Auth | WARN | NEXTAUTH_URL host | NEXTAUTH_URL host: localhost:3100. |
| NewRepo | WARN | Worktree | NewRepo has uncommitted changes while generating this report. |

## Required Production Variables

These variable names must exist in Railway production:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET`
- `CLOUDFLARE_R2_PUBLIC_BASE_URL`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_CONTRIBUTOR`
- `STRIPE_PRICE_PROFESSIONAL`
- `STRIPE_PRICE_AUDITOR`
- `STRIPE_PRICE_ORG`
- `PLATFORM_LOG_LEVEL`
- `DIAGNOSTIC_LOGS_ENABLED`
- `AUDIT_LOGS_ENABLED`

## Manual Railway Smoke

- Confirm Railway service is linked to GitHub `Santroy8808/circlenest`.
- Confirm production branch is `main`.
- Confirm deployment starts after production GitHub push.
- Confirm build logs run `prisma generate` and `next build`.
- Confirm runtime logs do not show server-side exception digests after login.

## Manual Neon Smoke

- Confirm `DATABASE_URL` points to Neon PostgreSQL, not SQLite or local Postgres.
- Confirm migrations are reviewed before deployment.
- Confirm `npx prisma migrate status` is clean against the production connection string.
- Confirm backup/restore posture before schema-changing releases.
- Confirm login smoke users exist and are preverified after any seed/purge plan.

## Manual R2 Smoke

- Confirm R2 bucket name matches `CLOUDFLARE_R2_BUCKET`.
- Confirm CORS allows browser PUT uploads from `theta-space.net`.
- Confirm signed upload intent returns a URL.
- Confirm direct browser upload writes the object to R2.
- Confirm complete-upload stores the DB record.
- Confirm public URL renders the image after refresh.

## Manual Stripe Smoke

- Confirm Railway has all Stripe variables listed above.
- Confirm Stripe has active recurring prices for Contributor, Professional, Auditor, and Org.
- Confirm Stripe webhook endpoint points to `https://theta-space.net/api/billing/stripe/webhook`.
- Confirm webhook events include `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.
- Confirm `/settings/subscription` starts Stripe checkout for a configured paid tier.
- Confirm a completed checkout updates `Membership.subscriptionStatus`, `stripeCustomerId`, `stripeSubscriptionId`, and active membership tier in Neon.
- Confirm canceled or unpaid subscriptions downgrade effective access instead of leaving paid access active.

## Warnings

- Railway / Local project link: No .railway directory or railway.json found in NewRepo. Production may still deploy from GitHub, but local CLI context is not linked here.
- Neon / Neon host hint: Current host is localhost:5432.
- Cloudflare R2 / Required media env: Missing locally: CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET, CLOUDFLARE_R2_PUBLIC_BASE_URL.
- Cloudflare R2 / Public media URL: CLOUDFLARE_R2_PUBLIC_BASE_URL is missing or invalid.
- Stripe / Subscription env: Missing locally: STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_CONTRIBUTOR, STRIPE_PRICE_PROFESSIONAL, STRIPE_PRICE_AUDITOR, STRIPE_PRICE_ORG.
- Auth / NEXTAUTH_URL host: NEXTAUTH_URL host: localhost:3100.
- NewRepo / Worktree: NewRepo has uncommitted changes while generating this report.

## Failures

- none

## Cutover Boundary

- Resolve failures before production promotion.
- Explain or resolve warnings before production promotion.
- Do not use this report as approval to deploy.
- Re-run after Railway is linked or environment variables change.
