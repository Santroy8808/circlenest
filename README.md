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

- `platform-infrastructure`: started
- All later modules: blueprint only

## Local Commands

```powershell
npm install
npm run env:check
npm run db:generate
npm run lint
npm run typecheck
npm run dev
```

## Production Cutover Rule

Before overwriting the live Railway source, archive the current production repo as `archive-<date>` or `archive-<date>.vN`, create a rollback tag, push the new source to GitHub, and smoke test Railway, Neon, and R2.

