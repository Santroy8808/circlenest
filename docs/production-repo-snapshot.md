# Theta-Space Production Repo Snapshot

Generated: 2026-06-18T05:15:33.194Z

## Purpose

Read-only snapshot of the local production repo path before any future NewRepo cutover.

This document does not copy files, push to GitHub, migrate Neon, deploy Railway, or touch Cloudflare R2.

## Paths

- NewRepo: `C:\Repos\Theta-Space-net\NewRepo`
- Production repo: `C:\Repos\thetansplace\circlenest`

## NewRepo Source

- Package: `theta-space-newrepo`
- Commit: `f262b47`
- Full commit: `f262b473d67af4766abc89ce539924bcd0bde786`
- Worktree: clean when snapshot was generated

## Production Repo Source

- Exists: yes
- Git repo: yes
- Package: `theta-space`
- Version: `0.1.0`
- Branch: `main`
- Commit: `522ac56`
- Full commit: `522ac56c50d0de4dccb97a33293f7511259efd7f`
- Worktree: dirty

## Production Remote

```text
devlocal	C:\Repos\thetansplace\circlenest-dev (fetch)
devlocal	C:\Repos\thetansplace\circlenest-dev (push)
origin	https://github.com/Santroy8808/circlenest.git (fetch)
origin	https://github.com/Santroy8808/circlenest.git (push)
```

## Production Recent Commits

- `522ac56 Refactor gallery into photo-first organizer`
- `8a677d5 Improve friends and internal mail`
- `6952b08 Improve media performance and member references`
- `49bc69b Move gallery uploads to direct storage`
- `2c13864 Personalize sidebar identity`
- `1168d01 Redesign admin portal as guided action wizards`
- `d0b0f8d Merge remote-tracking branch 'origin/main'`
- `2b52589 Refine market tiles and separate mail from chat`

## Archive Tags

- `archive-2026-06-16`

## Script Comparison

- NewRepo scripts: build, cutover:check, db:generate, db:migrate, db:push, db:seed, dev, env:check, lint, prod:snapshot, release:manifest, start, typecheck
- Production scripts: billing:mock:simulate, build, build:netlify, db:generate, db:generate:pg, db:migrate, db:push:pg, db:seed, dev, docker:down, docker:logs, docker:up, lint, platform:mock:simulate, postinstall, stable:create, stable:list, stable:rollback, start, test:phase1, test:phase8

## Warnings

- Production repo has uncommitted changes.

## Cutover Boundary

- If warnings exist, resolve them before production promotion.
- Archive production with `archive-YYYY-MM-DD.vN` before overwrite.
- Use `--force-with-lease` only for an approved rollback to a verified archive tag.
- Do not treat this snapshot as approval to push production.
