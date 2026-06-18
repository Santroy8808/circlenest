# Admin Moderation

## Purpose

Provide safe administrative and moderation operations through guided cards and wizard walkthroughs.

## User-Facing Surfaces

- `/admin` for the admin portal.
- `/admin/actions/[actionKey]` for literal guided action walkthroughs.
- `/api/admin/feature-flags` for the first live audited admin mutation.

## Primary Code Areas

- `src/modules/admin-moderation`
- `src/components/admin-moderation`
- `src/app/admin`
- `src/app/api/admin`

## Data Ownership

- `AuditLog` remains the privileged action history.
- `AdminAction` records completed admin operations.
- `FeatureFlag` stores feature switches.
- `DiagnosticLog` provides operational visibility.
- Future report, category, announcement, support-note, and verification tables should attach here.

## Core Workflows

- Admin opens `/admin`.
- Admin chooses an action card.
- Action opens a wizard with explicit steps and risk label.
- Feature flag wizard can save a flag and writes `AdminAction` plus `AuditLog`.
- Other action wizards define safe flow until their mutation policies are explicit.

## Access Rules

- Global Admin role only.
- Non-admin users are redirected away from `/admin`.
- Admin actions must write audit logs before becoming production-live.
- Real-money balances are never directly mutable by this portal.

## Current Action Cards

- Session revocation.
- Email verification resend.
- Feature flags.
- View-as-role preview.
- Audit viewer.
- Reports queue.
- Business verification.
- Public announcements.

## Integrations

- Feature flags integrate with platform infrastructure.
- Audit and diagnostics are visible from the portal.
- Future modules should add wizard mutation forms here instead of creating scattered admin pages.

## Diagnostics And Audit

- Feature flag updates write `AdminAction`, `AuditLog`, and diagnostic logs.
- Portal reads recent audit and diagnostic entries.

## Smoke Checklist

- `/admin` redirects logged-out users to login.
- Non-admin users cannot see admin portal.
- Feature flag update writes audit/admin action.
- Dashboard shows Phase 24 as Ready and Phase 25 as Next.
