# Marketplace-First Rollout Runbook

## Preconditions

1. Connect to the Theta-Space server through Radmin VPN.
2. Confirm SSH access with the `theta-space-prod` alias.
3. Confirm `main` is clean, tests are green, and the release commit is pushed to `Santroy8808/circlenest`.
4. Create a fresh full database dump, protected-retention dump, source archive, Git bundle, manifest, and checksums outside `S:\Workspace\circlenest`.
5. Restore the dump into an isolated database and verify the expected table count before changing production.

The pre-development restore point for this release is:

- Git tag: `production-pre-marketplace-20260820-044914`
- Server backup: `S:\Backups\theta-space\pre-marketplace-20260820-044914`

Create another timestamped backup immediately before deployment. Do not rely only on the earlier restore point.

## Deployment Order

1. Fetch `origin/main` in `S:\Workspace\circlenest` and verify the expected commit SHA.
2. Stop `ThetaSpaceWorker` and `ThetaSpaceWeb`. Keep PostgreSQL and Caddy running.
3. Fast-forward the production checkout to `origin/main`.
4. Run `npm ci`.
5. Run `npm run env:check` and `npx prisma generate`.
6. Run `npx prisma migrate status`, then `npx prisma migrate deploy`.
7. Run `npm run build`.
8. Start `ThetaSpaceWeb`, then `ThetaSpaceWorker`.
9. Verify `/health/live`, `/health/ready`, and `/health/version` before enabling the rollout flag.
10. Smoke-test the existing home, authentication, feedback, billing webhook, and media paths while `marketplace.focused_rollout` remains disabled.
11. Enable `marketplace.focused_rollout` through the feature-flag service or an audited database update.
12. Smoke-test `/`, `/marketplace`, one listing detail, search/filter query strings, login, create draft, manage, saved, and interactions on desktop and mobile.

## Data Checks

- All marketplace migrations are applied, including the directory-bridge retirement migration.
- Active official church and auditor profiles remain searchable in `AuditorProfile` and have zero active bridge-generated marketplace listings.
- Account-created auditor listings remain independent marketplace records and are not tagged `sourceProfileSync`.
- Legacy `MarketListing` and `JobListing` counts are unchanged.
- New listing events and waived fee-ledger entries are written during QA publishing.
- The worker log reports marketplace expiration and saved-search processing without repeated alerts.

## Rollback

1. Disable `marketplace.focused_rollout` first. This immediately restores the previous navigation and root behavior while preserving unified records.
2. If application rollback is required, stop web and worker services and return the checkout to the signed rollback tag or prior release commit.
3. Reinstall dependencies, regenerate Prisma, rebuild, and restart services.
4. Do not reverse schema migrations while production data may reference the new tables. Restore the verified predeploy database dump only when a full data rollback is explicitly required.
5. Re-run health and legacy Market/Jobs smoke checks.

## Backup Job

`scripts/backup-database-hourly.ps1` creates a full dump plus a protected-retention subset. It removes Prisma-only URL options before calling PostgreSQL tools and includes only protected tables that exist in the current schema. The manifest records both included and skipped protected tables. The scheduled task must exit successfully after each schema change.
