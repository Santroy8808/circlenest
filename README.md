# Theta-Space

This is the production source repo for Theta-Space.

## Platform Targets

- Production server checkout: `S:\Workspace\circlenest`
- Local development checkout: `C:\Repos\Theta-Space-net\NewRepo`
- Web hosting: Windows Server behind Caddy
- Database: production PostgreSQL
- Media: Cloudflare R2
- Production GitHub source: `Santroy8808/circlenest`

## Build Sequence

The app is rebuilt one module at a time. Each module has a blueprint in `docs/modules`, must compile, must pass lint/typecheck, and must receive browser visual QC before the next module is started.

Current implementation status:

- Desktop/API production source is this repo on `main`
- Android remains in the existing Android repo and consumes the same API contracts

## Local Commands

```powershell
npm install
npm run workspace:verify
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
npm run services:readiness
npm run dev
```

## Canonical Workspace Guardrail

Before editing, run:

```powershell
npm run workspace:verify
```

This confirms the working path is `C:\Repos\Theta-Space-net\NewRepo`, the remote is `https://github.com/Santroy8808/circlenest.git`, and the branch is `main`.

On production, set `THETA_EXPECTED_REPO_PATH` if you want the guardrail to enforce the server path:

```powershell
$env:THETA_EXPECTED_REPO_PATH='S:\Workspace\circlenest'
```

Repo layout details are in `docs/repo-layout.md`.

## Production Cutover Rule

Before changing live production, create a server backup under `S:\Backups`, create a rollback tag or commit reference, pull from GitHub, build, restart the local app service behind Caddy, and smoke test Caddy, PostgreSQL, and R2.
