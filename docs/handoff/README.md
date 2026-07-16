# Theta-Space Handoff System

Purpose: preserve project state in files so a new Codex chat can resume by reading targeted references instead of consuming tokens on the full conversation history.

## How A New Thread Should Start

Read these files in order:

1. `docs/handoff/current.md`
2. `docs/handoff/context-index.md`
3. Any task-specific snapshot named in `docs/handoff/current.md`

Do not start by scanning the whole repository. Use the context index to load only the files needed for the active task.

## Handoff File Structure

```text
docs/
  handoff/
    README.md
      Explains how to use and maintain the handoff system.
    current.md
      The current live handoff. This is the first file a new thread should read.
    context-index.md
      Stable map of important repo files, docs, services, and operational references.
    snapshots/
      YYYY-MM-DD-short-topic.md
        Point-in-time task notes for major work sessions.
```

## Update Rules

Update `docs/handoff/current.md` whenever a work session ends with unpushed work, failed verification, pending deployment, a schema migration, or a user decision that affects future behavior.

Create a new `docs/handoff/snapshots/YYYY-MM-DD-topic.md` when:

- the task spans database, service, and UI layers;
- the task is not fully deployed;
- the user gives a standing product rule;
- a migration, server process, external service, or APK build is involved;
- there are known limitations that a future thread must not forget.

Keep `docs/handoff/context-index.md` focused on references, not narrative. It should tell the next thread where to look, not repeat entire files.

## What Not To Store

Do not store plaintext passwords, API keys, tokens, R2 secrets, database URLs, or private SSH key contents in this folder. Reference the location of existing secure configuration only when needed.

## Completion Standard

Before marking any implementation complete, use `docs/feature-completion-standard.md`.

For desktop web work, the minimum verification is:

```powershell
npm run typecheck
npm run lint
npm run build
```

For schema changes, also run:

```powershell
npx prisma format
npx prisma generate
```
