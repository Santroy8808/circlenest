# Ads Credits

## Purpose

Provide transparent internal advertising that uses labeled reserved placements and never corrupts posts, listings, event details, or job details.

## User-Facing Surfaces

- `/ads` for campaign management.
- `/ads/create` for focused ad creation.
- Production Zone Business Center card for eligible accounts.

## Primary Code Areas

- `src/modules/ads-credits`
- `src/components/ads-credits`
- `src/app/ads`
- `src/app/api/ads/campaigns`

## Data Ownership

- `AdCampaign` owns campaign copy, placement, budget, targeting fields, and spend totals.
- `AdCreditLedgerEntry` records platform-credit reservations and future grant/spend history.
- `AdDeliveryLog` records impression/click diagnostics for future placement systems.
- `Membership.platformCredits` remains the current user-facing platform-credit balance.

## Core Workflows

- Eligible user opens Ads from Production Zone.
- User creates a reserved-placement ad campaign.
- Non-admin campaign creation reserves platform credits immediately.
- Admin campaign creation is allowed without credit reservation.
- Future delivery services can call `logAdDelivery()` to record impressions and clicks.

## Access Rules

- General ad creation requires Admin role or the `ads.createGeneral` feature.
- Contributor marketplace-specific ad handoffs are intentionally not implemented as general ads in this phase.
- Campaign targeting is limited to plain location text in this phase.
- Ads are not rendered inside listings, events, jobs, posts, or comments.

## Integrations

- Business Center and Production Zone link to Ads for eligible accounts.
- Market, jobs, and events should hand off promotion to this module rather than embedding ads internally.
- Admin can later manage global credit costs, grants, and placement controls.

## Diagnostics And Audit

- Campaign creation writes diagnostic and audit logs.
- Delivery logging writes diagnostic-level events.
- Credit reservations write ledger entries.

## Smoke Checklist

- `/ads` redirects logged-out users to login.
- `/ads/create` blocks accounts without general ad access.
- Campaign creation rejects insufficient platform credits for non-admin users.
- Campaign creation creates an `AdCreditLedgerEntry` reservation.
- Dashboard shows Phase 21 as Ready and Phase 22 as Next.
