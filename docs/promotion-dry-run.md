# Theta-Space Promotion Dry Run

Generated: 2026-06-25T11:20:24.276Z

## Purpose

Read-only manifest of what NewRepo would contribute to a future production promotion.

This document does not copy files, delete files, archive production, push GitHub, migrate Neon, deploy Railway, or touch Cloudflare R2.

## Source State

- NewRepo path: `C:\Repos\Theta-Space-net\NewRepo`
- NewRepo commit: `19a3a6d`
- NewRepo full commit: `19a3a6deb883fa03b9a732d72e23526c69e9b2ca`
- NewRepo worktree: dirty when dry run was generated
- Production repo path: `C:\Repos\thetansplace\circlenest`
- Production branch: `unknown`
- Production commit: `unknown`
- Production full commit: `unknown`
- Production worktree: clean

## Summary

- NewRepo tracked files: 451
- Included tracked files: 451
- Excluded tracked files: 0
- Shared production paths: 0
- New paths not currently in production: 451
- Production tracked paths not in NewRepo: 0

## Included File Categories

- App routes: 203
- Components: 86
- Docs: 41
- Modules: 71
- Platform libraries: 11
- Prisma: 4
- Public assets: 2
- Root/config: 21
- Scripts: 12

## Exclusion Rules

Never copy these during promotion:

- Git internals: `.git`
- Build output: `.next`, `dist`, `coverage`, `.turbo`
- Dependencies: `node_modules`
- Hosting leftovers: `.vercel`, `.netlify`
- Local env and secrets: `.env` and `.env.*` except tracked templates such as `.env.example`
- Local databases: `*.db`, `*.sqlite`, `*.sqlite3`
- TypeScript build cache: `*.tsbuildinfo`
- Local upload/output folders: `uploads`, `tmp`
- Windows system files: `DumpStack.log.tmp`, `hiberfil.sys`, `pagefile.sys`, `swapfile.sys`

## Excluded Tracked Files

- none

## NewRepo Files Not Currently In Production

- `.dockerignore`
- `.env.example`
- `.eslintrc.json`
- `.gitignore`
- `AGENTS.md`
- `DATA_MODEL_MAP.md`
- `Dockerfile`
- `MODULE_INDEX.md`
- `README.md`
- `ROUTE_API_MAP.md`
- `SYSTEM_MAP.md`
- `docs/audits/live-ux-efficiency-baseline-2026-06-24.md`
- `docs/audits/module-boundary-risks.md`
- `docs/audits/naming-and-legacy-notes.md`
- `docs/audits/production-scan-summary.md`
- `docs/browser-smoke-checklist.md`
- `docs/cutover-readiness.md`
- `docs/cutover-runbook.md`
- `docs/demo-network-blueprint.md`
- `docs/external-services-readiness.md`
- `docs/feature-completion-standard.md`
- `docs/modules/01-platform-infrastructure.md`
- `docs/modules/01a-feedback-support.md`
- `docs/modules/02-auth-security.md`
- `docs/modules/03-membership-policy.md`
- `docs/modules/04-profile-identity.md`
- `docs/modules/05-my-scientology.md`
- `docs/modules/06-gallery-media-storage.md`
- `docs/modules/07-feed-stream.md`
- `docs/modules/08-social-graph.md`
- ... 421 more

## Production Tracked Files Not In NewRepo

These production paths need a conscious keep/remove decision before overwrite:

- none

## Production Local Artifacts

These are uncommitted production worktree entries or ignored-looking files:

- none

## Warnings

- NewRepo has uncommitted changes while generating this dry run.
- Production repo is on unknown, not main.

## Promotion Boundary

- Use this dry run to review file scope before archive and promotion.
- A future copy command should be driven by tracked source files plus explicit exclusions.
- Do not promote if production has unexplained local artifacts.
- Do not promote if NewRepo is dirty.
- Do not treat this dry run as approval to deploy.
