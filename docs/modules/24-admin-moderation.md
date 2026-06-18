# Admin Moderation

## Purpose

Provide safe administrative and moderation operations through guided actions.

## User-Facing Surfaces

- Admin portal.
- Action cards.
- Wizard walkthroughs.
- Reports/moderation queue.

## Primary Code Areas

- `src/modules/admin-moderation`
- `src/components/admin`
- `src/app/admin`

## Data Ownership

- `AuditLog`
- `AdminAction`
- future report, moderator assignment, support note, feature flag, category, announcement tables.

## Core Workflows

- Grant/revoke roles.
- Session revocation.
- Force terms acceptance.
- Feature flags.
- Category management.
- Business verification.
- Report handling.
- View-as-role without impersonation.

## Access Rules

Global Admin only, with admin-mode password/session where required.

## Integrations

Every privileged module, audit logs, alerts, feature flags.

## Current Design Notes

Admin portal is card list first, then literal wizard.

## Smoke Checklist

- Non-admin cannot see admin portal.
- Every admin action writes audit log.

