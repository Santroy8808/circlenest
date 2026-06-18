# Theta-Space Promotion Dry Run

Generated: 2026-06-18T05:42:15.225Z

## Purpose

Read-only manifest of what NewRepo would contribute to a future production promotion.

This document does not copy files, delete files, archive production, push GitHub, migrate Neon, deploy Railway, or touch Cloudflare R2.

## Source State

- NewRepo path: `C:\Repos\Theta-Space-net\NewRepo`
- NewRepo commit: `ad9fdf7`
- NewRepo full commit: `ad9fdf71e2dd43f9be9f86ecf5ecd74fef71d910`
- NewRepo worktree: clean when dry run was generated
- Production repo path: `C:\Repos\thetansplace\circlenest`
- Production branch: `main`
- Production commit: `522ac56`
- Production full commit: `522ac56c50d0de4dccb97a33293f7511259efd7f`
- Production worktree: dirty

## Summary

- NewRepo tracked files: 323
- Included tracked files: 323
- Excluded tracked files: 0
- Shared production paths: 65
- New paths not currently in production: 258
- Production tracked paths not in NewRepo: 445

## Included File Categories

- App routes: 135
- Components: 60
- Docs: 37
- Modules: 56
- Platform libraries: 8
- Prisma: 2
- Root/config: 17
- Scripts: 8

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

- `DATA_MODEL_MAP.md`
- `MODULE_INDEX.md`
- `ROUTE_API_MAP.md`
- `SYSTEM_MAP.md`
- `docs/audits/module-boundary-risks.md`
- `docs/audits/naming-and-legacy-notes.md`
- `docs/audits/production-scan-summary.md`
- `docs/browser-smoke-checklist.md`
- `docs/cutover-readiness.md`
- `docs/cutover-runbook.md`
- `docs/external-services-readiness.md`
- `docs/modules/01-platform-infrastructure.md`
- `docs/modules/01a-feedback-support.md`
- `docs/modules/02-auth-security.md`
- `docs/modules/03-membership-policy.md`
- `docs/modules/04-profile-identity.md`
- `docs/modules/05-my-scientology.md`
- `docs/modules/06-gallery-media-storage.md`
- `docs/modules/07-feed-stream.md`
- `docs/modules/08-social-graph.md`
- `docs/modules/09-notifications-alerts.md`
- `docs/modules/10-chat-messages.md`
- `docs/modules/11-mail.md`
- `docs/modules/12-groups.md`
- `docs/modules/13-group-forum.md`
- `docs/modules/14-group-media-docs.md`
- `docs/modules/15-events.md`
- `docs/modules/16-market.md`
- `docs/modules/17-jobs.md`
- `docs/modules/18-auditors.md`
- ... 228 more

## Production Tracked Files Not In NewRepo

These production paths need a conscious keep/remove decision before overwrite:

- `.dockerignore`
- `Bugs`
- `Dockerfile`
- `docker-compose.yml`
- `docs/BLUEPRINT-OUTLINE.md`
- `docs/CODEX-PROMPT-PLAN.md`
- `docs/PLATFORMS.md`
- `docs/PROJECT-PLAN-TIER-POLICY.md`
- `docs/RUNBOOK.md`
- `docs/SECURE_AREAS.md`
- `docs/architecture/modular-monolith.md`
- `docs/operations/BACKUP-VERIFICATION.md`
- `docs/operations/BROWSER-QA-TIER-RECHECK-2026-06-04.md`
- `docs/operations/BROWSER-QA-TIER-TEST-2026-06-04.md`
- `docs/operations/CODEX-IMPLEMENTATION-PLAN-BIZ-ADS-FUNDS-ADMIN.md`
- `docs/operations/HANDOFF-2026-06-02.md`
- `docs/operations/LAUNCH-CHECKLIST.md`
- `docs/operations/PRODUCTION-SMOKE-TESTS.md`
- `docs/operations/REPO_ARCHITECTURE.md`
- `docs/operations/STABLE_POINTS_AND_ROLLBACK.md`
- `docs/operations/TIER-FUTURE-WORK-FINALIZED.md`
- `docs/operations/TIER-GATE-SMOKE-TESTS.md`
- `docs/operations/mock-billing/mock-billing-log.jsonl`
- `docs/operations/mock-platform/README.md`
- `docs/operations/mock-platform/mock-platform-log.jsonl`
- `docs/operations/mock-platform/reports/2026-01.md`
- `docs/operations/mock-platform/reports/2026-02.md`
- `docs/operations/mock-platform/reports/2026-03.md`
- `docs/operations/mock-platform/reports/2026-04.md`
- `docs/operations/mock-platform/reports/2026-05.md`
- ... 415 more

## Production Local Artifacts

These are uncommitted production worktree entries or ignored-looking files:

- `?? tsconfig.tsbuildinfo`

## Warnings

- Production repo has uncommitted changes or untracked files.
- Production repo contains local artifacts that should not be promoted.

## Promotion Boundary

- Use this dry run to review file scope before archive and promotion.
- A future copy command should be driven by tracked source files plus explicit exclusions.
- Do not promote if production has unexplained local artifacts.
- Do not promote if NewRepo is dirty.
- Do not treat this dry run as approval to deploy.
