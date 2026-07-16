# Production Cutover Readiness

## Purpose

Prepare the repository for controlled deployment to the user-owned Windows production server.

This is not the cutover command. It is the checklist and preflight boundary that keeps us from accidentally replacing production without rollback.

## Current Production Targets

- Production repo path: `C:\Repos\thetansplace\circlenest`
- New rebuild repo path: `C:\Repos\Theta-Space-net\NewRepo`
- GitHub production source: `Santroy8808/circlenest`
- Web hosting: Windows Server through `ThetaSpaceWeb` and Caddy
- Database: self-hosted PostgreSQL
- Media: Cloudflare R2

## Required Before Cutover

- NewRepo worktree is clean.
- NewRepo has passed `npm run lint`.
- NewRepo has passed `npm run typecheck`.
- NewRepo has passed `npm run build` using PostgreSQL-style environment variables.
- Browser visual smoke has been completed for login, home, search, profile, gallery, groups, mail, market, jobs, admin, and feedback.
- Production repo is backed up as `archive-<date>` or `archive-<date>.vN`.
- A rollback Git tag exists for the pre-cutover production commit.
- Self-hosted PostgreSQL migration plan is reviewed before applying.
- R2 upload smoke test is ready.
- Windows service deployment verification checklist is ready.
- Login smoke users are available and preverified.

## Preflight Command

Run from NewRepo:

```powershell
npm run cutover:check
```

The preflight is read-only. It checks repo shape, Git state, expected paths, and required environment variables. It does not push, migrate, archive, delete, upload, or deploy.

## Release Candidate Manifest

Run from NewRepo:

```powershell
npm run release:manifest
```

This writes `docs/release-candidate.md` with the current commit, ready module list, validation commands, browser smoke routes, recent commits, and production boundary notes.

## Production Repo Snapshot

Run from NewRepo:

```powershell
npm run prod:snapshot
```

This writes `docs/production-repo-snapshot.md` with the local production repo branch, remote, commit, archive tags, script comparison, and warnings. It is read-only and does not touch production.

## Cutover Runbook

Run from NewRepo:

```powershell
npm run cutover:runbook
```

This writes `docs/cutover-runbook.md` with the suggested archive tag, validation commands, production promotion outline, production smoke checklist, and rollback command block. It is read-only documentation and does not perform the cutover.

## Browser Smoke Checklist

Run from NewRepo:

```powershell
npm run browser:smoke
```

This writes `docs/browser-smoke-checklist.md` with route-by-route visual QC steps for desktop and mobile. It is a manual test guide and does not perform browser actions.

## Promotion Dry Run

Run from NewRepo:

```powershell
npm run promote:dry-run
```

This writes `docs/promotion-dry-run.md` with the Git-tracked files NewRepo would contribute, excluded local/build/secret artifacts, production-only tracked paths, and production worktree hazards. It is read-only and does not copy files.

## External Services Readiness

Run from NewRepo:

```powershell
npm run services:readiness
```

This writes `docs/external-services-readiness.md` with Windows server, self-hosted PostgreSQL, Cloudflare R2, and auth runtime environment checks. It is read-only and does not connect, deploy, migrate, or upload.

## Dashboard

The in-app cutover dashboard is available at:

```text
/cutover
```

It mirrors the release gates, route smoke matrix, rollback reminders, and non-goals in a visual control surface.

## Cutover Outline

1. Confirm NewRepo build and browser QC are green.
2. Confirm the production checkout at `S:\Workspace\circlenest` tracks GitHub `Santroy8808/circlenest`.
3. In the production repo, create an archive branch/tag:

```powershell
git tag archive-YYYY-MM-DD.v1
git push origin archive-YYYY-MM-DD.v1
```

4. Copy or promote the NewRepo source into the production repo according to the chosen cutover method.
5. Commit production source with a clear release message.
6. Push production `main` to GitHub.
7. Build and restart the `ThetaSpaceWeb` Windows service using the approved commit.
8. Confirm self-hosted PostgreSQL migrations and R2 media smoke tests.
9. Run login and route smoke tests on `theta-space.net`.

## Rollback Rule

If the production smoke fails and cannot be fixed quickly:

```powershell
git checkout main
git reset --hard archive-YYYY-MM-DD.v1
git push --force-with-lease origin main
```

Only run rollback commands after explicitly confirming the target rollback tag and production branch.

## Smoke Checklist

- `theta-space.net/login` loads.
- Seed/preverified user login works.
- `/home` loads after login.
- `/search` loads after login and redirects when logged out.
- `/profile/gallery` loads without secure-area prompt.
- R2 image upload creates a DB record and remains visible after refresh.
- `/groups` loads and group cards navigate to group profiles.
- `/mail` opens as mail-only, not chat.
- `/market` shows square listing cards.
- `/jobs` shows clickable listings.
- `/feedback/new` can create a support ticket.
- `/admin` is protected and wizard/card based.

## Known Non-Goals For This Step

- Do not purge production data.
- Do not migrate the production PostgreSQL database from this local checklist.
- Do not push to GitHub.
- Do not overwrite the production repo.
- Do not touch Cloudflare R2 objects.
