# Admin Moderation

## Purpose

Provide safe administrative and moderation operations through guided cards and wizard walkthroughs.

## User-Facing Surfaces

- `/admin` for the admin portal.
- `/admin/actions/[actionKey]` for literal guided action walkthroughs.
- `/api/admin/feature-flags` for registered, enforced feature switches.
- `/api/admin/status-change` for audited membership tier changes.
- `/api/admin/platform-credits` for platform-only credit adjustments.
- `/api/admin/announcements` for public announcement publishing.
- `/api/admin/stripe-setup` for Stripe connection, price ID, and credit-package setup.
- `/admin/actions/conduct-review` for bounded conduct-report search, assignment, evidence review, and legal status decisions.
- `/api/admin/conduct` for versioned, audited conduct queries and mutations.

## Primary Code Areas

- `src/modules/admin-moderation`
- `src/modules/billing/stripe-admin.service.ts`
- `src/components/admin-moderation`
- `src/components/admin-moderation/admin-stripe-setup-wizard.tsx`
- `src/app/admin`
- `src/app/api/admin`

## Data Ownership

- `AuditLog` remains the privileged action history.
- `AdminAction` records completed admin operations.
- `FeatureFlag` stores administrator overrides. Registered definitions, defaults, effects, and enforcement notes live in the feature-flag service catalog.
- `DiagnosticLog` provides operational visibility.
- Conduct incidents, reports, evidence/history, disputes, participants, candidates, and restrictions provide the moderation record. `ConductIncident.version` protects aggregate decisions from stale writes.
- Announcement, support, and verification records attach to their owning modules while privileged mutations remain visible through the admin audit history.

## Core Workflows

- Admin opens `/admin`.
- Admin chooses an action card.
- Action opens a wizard with explicit steps and risk label.
- Feature Flags lists only registered controls, explains the effect and enforcement point, confirms enable/disable changes, and writes `AdminAction` plus `AuditLog`.
- Registered controls are organized into Community; Communication & Media; Market, Publishing & Discovery; Membership & Support; and Platform Operations.
- A category switch applies one audited on/off decision to every registered feature in that category. Changing an individual control afterward produces a visible Mixed category state.
- Reset to default deletes only the administrator override; the capability then follows its documented code default.
- Status Change wizard permanently changes a member's tier without changing admin role or real-money balances.
- Platform Credits wizard grants/removes platform-only credits with ledger and audit records.
- Stripe Setup wizard configures connection status, membership price IDs, and credit purchase packages.
- Public Announcement wizard publishes notices through selected delivery channels.
- Conduct Review searches reports on the server with bounded text, status, and reviewer filters; opens source/evidence/dispute context; assigns an active administrator; and exposes only state-legal decisions.
- Conduct mutations require an administrative reason and note, reauthorize the acting administrator inside the transaction, compare report/incident versions, use stable lock order and bounded serializable retries, and persist an idempotent command receipt with conduct events, `AdminAction`, and `AuditLog`.
- A stale conduct result must be refreshed and reviewed again. Generic report controls cannot reopen or otherwise bypass a linked dispute.
- Other action wizards define safe flow until their mutation policies are explicit.

## Access Rules

- Global Admin role only.
- Non-admin users are redirected away from `/admin`.
- Admin actions must write audit logs before becoming production-live.
- Real-money balances are never directly mutable by this portal.
- Stripe Setup can configure checkout inputs, but subscriptions and credit purchases are fulfilled only by verified Stripe webhooks.

## Current Action Cards

- Session revocation.
- Email verification resend.
- Feature flags.
- Status Change membership tier wizard.
- View-as-role preview.
- Audit viewer.
- Reports queue.
- Conduct report review.
- Business verification.
- Public announcements.
- Stripe Setup.

## Integrations

- Feature flags are enforced at the affected navigation, page tree, and documented mutation boundaries. Current controls cover Groups, Direct Messages, My Pics, the Member Marketplace, the Auditor Directory, Writers Corner, single invitations, bulk invitations, the Feedback Center, and Communication Review.
- A global feature switch never grants a membership capability. Both the feature flag and the member's tier permission must allow the action.
- Flag changes are read on the next request; no restart or redeployment is required.
- Audit and diagnostics are visible from the portal.
- Future modules should add wizard mutation forms here instead of creating scattered admin pages.
- Stripe Setup integrates with `docs/modules/27-stripe-billing.md` and is the admin-facing bridge for checkout keys, recurring price IDs, and credit package price IDs.

## Diagnostics And Audit

- Feature flag, Status Change, Platform Credits, Stripe Setup, Public Announcement, and successful Conduct Review updates write audit records.
- Conduct Review also writes a durable command receipt and conduct event so an identical retry replays safely while a reused command for a different decision is rejected.
- Stripe Setup masks saved secret values in reads and only exposes presence/last-four style status to the UI.
- Portal reads recent audit and diagnostic entries.

## Smoke Checklist

- `/admin` redirects logged-out users to login.
- Non-admin users cannot see admin portal.
- `/admin` search finds Billing > Stripe Setup.
- Non-admin users cannot access `/api/admin/stripe-setup`.
- Feature flag update writes audit/admin action, changes the effective state, and rejects unknown keys.
- A direct URL or API mutation cannot bypass a disabled registered feature.
- Conduct report search rejects unknown/unbounded filters and returns the report/incident versions required for safe decisions.
- Conduct assignment rejects inactive or unauthorized assignees and detects an intervening assignment.
- Conduct status controls match the server's legal-transition policy, require reason and note, and reject stale versions without overwriting newer work.
- Linked disputes cannot be bypassed by generic report reopen controls.
- An identical conduct command retry returns its durable receipt without duplicating audit/history events.
- Status Change can find a member, change tier, reset storage limit to the selected tier policy, and write audit/admin action.
- Stripe Setup can save keys, membership price IDs, and credit packages without exposing raw saved secrets.
- Dashboard shows Phase 24 as Ready and Phase 25 as Next.
