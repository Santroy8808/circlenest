# Theta-Space NewRepo

This is the clean rebuild repo for Theta-Space, created from the current production app shape in `C:\Repos\thetansplace\circlenest`.

## Platform Targets

- Web hosting: Railway
- Database: Neon PostgreSQL
- Media: Cloudflare R2
- Production GitHub source at cutover: `Santroy8808/circlenest`

## Build Sequence

The app is rebuilt one module at a time. Each module has a blueprint in `docs/modules`, must compile, must pass lint/typecheck, and must receive browser visual QC before the next module is started.

Current implementation status:

- Core module phases 1-26: built in NewRepo
- Next slice: cutover readiness and production overwrite planning

## Local Commands

```powershell
npm install
npm run env:check
npm run db:generate
npm run lint
npm run typecheck
npm run cutover:check
npm run release:manifest
npm run prod:snapshot
npm run cutover:runbook
npm run browser:smoke
npm run promote:dry-run
npm run dev
```

## Production Cutover Rule

Before overwriting the live Railway source, archive the current production repo as `archive-<date>` or `archive-<date>.vN`, create a rollback tag, push the new source to GitHub, and smoke test Railway, Neon, and R2.
