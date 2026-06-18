# Platform Infrastructure

## Purpose

Provide the foundation every other module uses: repo conventions, environment validation, PostgreSQL/Prisma, Cloudflare R2 access, diagnostics, audit plumbing, feature flags, health checks, app shell, and the base visual system.

## User-Facing Surfaces

- `/` platform dashboard.
- `/health` readiness and module health page.
- Shared app shell, control panel, header, responsive layout, and theme tokens.

## Primary Code Areas

- `src/lib/platform`
- `src/modules/platform-infrastructure`
- `src/components/platform`
- `src/app`
- `prisma/schema.prisma`

## Data Ownership

- `DiagnosticLog`
- `AuditLog`
- `FeatureFlag`
- `ModuleHealthCheck`
- `AdminAction`

## Core Workflows

- Validate required deployment environment.
- Report module health.
- Write diagnostic logs when enabled.
- Write audit logs for privileged workflows.
- Resolve feature flags.
- Provide R2 client configuration without forcing upload traffic through Railway.

## Access Rules

Health status can be visible to authenticated admins later. Basic local health can be public during early build.

## Integrations

Every module depends on logging, feature flags, environment checks, DB access, and visual shell conventions from this module.

## Current Design Notes

This is the only module implemented in the first rebuild slice.

## Smoke Checklist

- App starts locally.
- `/` renders a usable dashboard.
- `/health` renders module status.
- `npm run env:check`, lint, and typecheck pass.

