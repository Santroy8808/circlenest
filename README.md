# CircleNest

CircleNest is an original, lightweight social platform with a rebuild foundation based on a modular monolith.

## Rebuild Foundation Implemented

- Domain-first module structure under `src/modules`.
- Service layer extraction started (`stream`, `groups`) to reduce route/UI coupling.
- Feature flags for controlled cutover.
- Docker Compose stack for laptop and Linux VM parity:
  - `web` (Next.js)
  - `db` (Postgres)
  - `proxy` (Caddy)
  - `minio` (S3-compatible beta storage)
- Postgres schema profile (`prisma/schema.postgres.prisma`) while keeping local SQLite profile.
- Runbook for non-developer operations at [`docs/RUNBOOK.md`](/C:/Users/MikeDeArmon/OneDrive%20-%20Compass%20Managed%20IT,%20Inc/Documents/YourSpace.com/circlenest/docs/RUNBOOK.md).

## Architecture

See [`docs/architecture/modular-monolith.md`](/C:/Users/MikeDeArmon/OneDrive%20-%20Compass%20Managed%20IT,%20Inc/Documents/YourSpace.com/circlenest/docs/architecture/modular-monolith.md).

## Local Run (Non-Docker)

```bash
npm install
npm run db:generate
npm run db:seed
npm run dev
```

## Local/VM Run (Docker Compose)

```bash
docker compose up -d --build
docker compose exec web npm run db:generate:pg
docker compose exec web npm run db:push:pg
docker compose exec web npm run db:seed
```

## Useful Scripts

- `npm run docker:up`
- `npm run docker:down`
- `npm run docker:logs`
- `npm run db:push:pg`
- `npm run db:generate:pg`

## Current Rebuild Notes

- Mobile intent: bottom-tab experience, no control panel sidebar, no ad stream.
- Desktop intent: stream-first center column + dedicated work/control pages.
- Polling-first realtime remains the baseline for now.
