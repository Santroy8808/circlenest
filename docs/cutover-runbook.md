# Theta-Space Production Cutover Runbook

Generated: 2026-06-18T05:42:33.644Z

## Purpose

Human-reviewed command sequence for a future NewRepo cutover into the production GitHub source.

This runbook is documentation only. It does not copy files, archive production, push GitHub, migrate production PostgreSQL, deploy the Windows service, or touch Cloudflare R2.

## Current Sources

- NewRepo path: `C:\Repos\Theta-Space-net\NewRepo`
- NewRepo branch: `main`
- NewRepo commit: `cdaed5e`
- NewRepo full commit: `cdaed5ed79aba62355864084f56f62e9b362e54c`
- Production repo path: `C:\Repos\thetansplace\circlenest`
- Production branch: `main`
- Production commit: `522ac56`
- Production full commit: `522ac56c50d0de4dccb97a33293f7511259efd7f`
- Suggested archive tag: `archive-2026-06-18`

## Production Remote

```text
devlocal	C:\Repos\thetansplace\circlenest-dev (fetch)
devlocal	C:\Repos\thetansplace\circlenest-dev (push)
origin	https://github.com/Santroy8808/circlenest.git (fetch)
origin	https://github.com/Santroy8808/circlenest.git (push)
```

## Warnings

- Production repo is dirty. Resolve or document this before archive.

## Phase 0 - Stop And Verify

Do these before any promotion:

- Confirm this is an approved cutover window.
- Confirm `S:\Workspace\circlenest` tracks GitHub `Santroy8808/circlenest`.
- Confirm self-hosted PostgreSQL production migrations are reviewed.
- Confirm Cloudflare R2 production bucket settings are known.
- Confirm live login smoke accounts are available.
- Confirm rollback owner is watching the deployment.

## Phase 1 - Validate NewRepo

Run from NewRepo:

```powershell
cd C:\Repos\Theta-Space-net\NewRepo
npm run lint
npm run typecheck
$env:DATABASE_URL='postgresql://user:password@localhost:5432/theta_space?schema=public'
$env:NEXTAUTH_SECRET='local-development-secret-32-chars'
$env:AUTH_SECRET='local-development-secret-32-chars'
npm run build
npm run cutover:check
npm run release:manifest
npm run prod:snapshot
npm run cutover:runbook
npm run promote:dry-run
npm run services:readiness
```

## Phase 2 - Archive Current Production

Run from production repo only after confirming the suggested tag:

```powershell
cd C:\Repos\thetansplace\circlenest
git status --short
git branch --show-current
git rev-parse HEAD
git tag archive-2026-06-18
git push origin archive-2026-06-18
```

Expected result:

- Archive tag `archive-2026-06-18` points to production commit `522ac56c50d0de4dccb97a33293f7511259efd7f`.
- GitHub shows the archive tag before production source is overwritten.

## Phase 3 - Promote NewRepo Source

Use the approved copy/promote method only after archive exists.

Rules:

- Do not copy `.env*`, `.next`, `node_modules`, temporary build files, or local SQLite files.
- Keep production Git history readable with one clear promotion commit.
- Re-run `npm run build` in production repo before push.
- Do not push if generated files or local artifacts are accidentally staged.

Recommended production validation:

```powershell
cd C:\Repos\thetansplace\circlenest
npm install
npm run lint
npm run typecheck
npm run build
git status --short
```

## Phase 4 - Push Production GitHub

Only after validation and archive confirmation:

```powershell
cd C:\Repos\thetansplace\circlenest
git add .
git commit -m "Promote NewRepo rebuild to production"
git push origin main
```

## Phase 5 - Windows Service, PostgreSQL, R2 Smoke

Deploy the approved GitHub commit to the Windows server, then verify:

- The production build succeeds.
- `ThetaSpaceWeb` boots without server-side exceptions.
- Self-hosted PostgreSQL migrations are applied or confirmed already current.
- R2 upload intent returns a valid signed URL.
- R2 complete-upload creates a DB media record.
- Uploaded media remains visible after refresh.

## Phase 6 - Browser Production Smoke

Verify on `theta-space.net`:

- `/login` loads.
- A preverified user can log in.
- `/home` loads after login.
- `/profile/gallery` opens without secure-area prompt.
- My Pics upload, refresh, avatar, and banner actions work.
- `/groups` cards open group pages.
- Group forum threads collapse, open, comment, and reply.
- `/mail` behaves as mail-only.
- `/messages` behaves as chat-only.
- `/market` listing cards are square thumbnail cards.
- `/jobs` listings open detail/contact pages.
- `/feedback/new` can create a ticket.
- `/admin` requires admin and uses card/wizard actions.

## Rollback

Rollback is destructive to production `main`. Only run after explicit approval and confirming the archive tag:

```powershell
cd C:\Repos\thetansplace\circlenest
git fetch origin --tags
git checkout main
git reset --hard archive-2026-06-18
git push --force-with-lease origin main
```

After rollback:

- Rebuild and restart `ThetaSpaceWeb` at the approved rollback commit.
- Confirm `theta-space.net/login` loads.
- Confirm a known account can log in.
- Record the failed release commit and rollback reason.

## Never From This Runbook

- Do not purge production data.
- Do not delete Cloudflare R2 objects.
- Do not force-push without a verified archive tag.
- Do not run rollback commands from NewRepo.
- Do not treat generated docs as approval to deploy.
