# Theta-Space External Services Readiness

Generated: 2026-06-18T05:41:44.762Z

## Purpose

Read-only readiness report for the external services used by Theta-Space:

- Railway for the web application runtime.
- Neon.tech for PostgreSQL.
- Cloudflare R2 for media storage.

This report does not deploy Railway, connect to Neon, upload to R2, mutate environment variables, or push GitHub.

## Source

- Repo: `C:\Repos\Theta-Space-net\NewRepo`
- Commit: `57b29f5`
- Full commit: `57b29f5d53fd7d38b3b90faab22db3ceedec0ed3`
- Worktree: clean when report was generated

## Summary

- Passed: 2
- Warnings: 6
- Failed: 2

| Service | Status | Check | Detail |
| --- | --- | --- | --- |
| Railway | PASS | CLI availability | railway.cmd is available: railway 5.8.0 |
| Railway | WARN | Local project link | No .railway directory or railway.json found in NewRepo. Production may still deploy from GitHub, but local CLI context is not linked here. |
| Neon | FAIL | DATABASE_URL presence | DATABASE_URL is missing. |
| Neon | FAIL | PostgreSQL URL shape | DATABASE_URL must be PostgreSQL for Neon; SQLite/file URLs are not valid for production. |
| Neon | WARN | Neon host hint | No database host available. |
| Cloudflare R2 | WARN | Required media env | Missing locally: CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET, CLOUDFLARE_R2_PUBLIC_BASE_URL. |
| Cloudflare R2 | WARN | Public media URL | CLOUDFLARE_R2_PUBLIC_BASE_URL is missing or invalid. |
| Auth | WARN | Runtime auth env | Missing locally: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL. |
| Auth | WARN | NEXTAUTH_URL host | NEXTAUTH_URL is missing or invalid. |
| NewRepo | PASS | Worktree | NewRepo was clean when this report was generated. |

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

## Warnings

- Railway / Local project link: No .railway directory or railway.json found in NewRepo. Production may still deploy from GitHub, but local CLI context is not linked here.
- Neon / Neon host hint: No database host available.
- Cloudflare R2 / Required media env: Missing locally: CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET, CLOUDFLARE_R2_PUBLIC_BASE_URL.
- Cloudflare R2 / Public media URL: CLOUDFLARE_R2_PUBLIC_BASE_URL is missing or invalid.
- Auth / Runtime auth env: Missing locally: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL.
- Auth / NEXTAUTH_URL host: NEXTAUTH_URL is missing or invalid.

## Failures

- Neon / DATABASE_URL presence: DATABASE_URL is missing.
- Neon / PostgreSQL URL shape: DATABASE_URL must be PostgreSQL for Neon; SQLite/file URLs are not valid for production.

## Cutover Boundary

- Resolve failures before production promotion.
- Explain or resolve warnings before production promotion.
- Do not use this report as approval to deploy.
- Re-run after Railway is linked or environment variables change.
