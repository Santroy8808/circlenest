# Production Cutover Readiness

## Purpose

Prepare the NewRepo rebuild for a controlled future cutover into the production GitHub source that Railway deploys.

This is not the cutover command. It is the checklist and preflight boundary that keeps us from accidentally replacing production without rollback.

## Current Production Targets

- Production repo path: `C:\Repos\thetansplace\circlenest`
- New rebuild repo path: `C:\Repos\Theta-Space-net\NewRepo`
- GitHub production source: `Santroy8808/circlenest`
- Web hosting: Railway
- Database: Neon PostgreSQL
- Media: Cloudflare R2

## Required Before Cutover

- NewRepo worktree is clean.
- NewRepo has passed `npm run lint`.
- NewRepo has passed `npm run typecheck`.
- NewRepo has passed `npm run build` using PostgreSQL-style environment variables.
- Browser visual smoke has been completed for login, home, search, profile, gallery, groups, mail, market, jobs, admin, and feedback.
- Production repo is backed up as `archive-<date>` or `archive-<date>.vN`.
- A rollback Git tag exists for the pre-cutover production commit.
- Neon migration plan is reviewed before applying.
- R2 upload smoke test is ready.
- Railway deployment verification checklist is ready.
- Login smoke users are available and preverified.

## Preflight Command

Run from NewRepo:

```powershell
npm run cutover:check
```

The preflight is read-only. It checks repo shape, Git state, expected paths, and required environment variables. It does not push, migrate, archive, delete, upload, or deploy.

## Cutover Outline

1. Confirm NewRepo build and browser QC are green.
2. Confirm Railway is linked to GitHub `Santroy8808/circlenest`.
3. In the production repo, create an archive branch/tag:

```powershell
git tag archive-YYYY-MM-DD.v1
git push origin archive-YYYY-MM-DD.v1
```

4. Copy or promote the NewRepo source into the production repo according to the chosen cutover method.
5. Commit production source with a clear release message.
6. Push production `main` to GitHub.
7. Watch Railway deploy.
8. Confirm Neon migrations and R2 media smoke tests.
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
- Do not migrate Neon.
- Do not push to GitHub.
- Do not overwrite the production repo.
- Do not touch Cloudflare R2 objects.
