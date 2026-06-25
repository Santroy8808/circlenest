# Ads Credits

## Purpose

Provide transparent internal advertising that uses labeled reserved placements and never corrupts posts, listings, event details, or job details.

## User-Facing Surfaces

- `/ads` for campaign management.
- `/ads/create` for focused ad creation.
- `/api/billing/credits/checkout` for Stripe credit purchase checkout.
- Production Zone Business Center card for eligible accounts.

## Primary Code Areas

- `src/modules/ads-credits`
- `src/components/ads-credits`
- `src/app/ads`
- `src/app/api/ads/campaigns`
- `src/app/api/billing/credits/checkout`
- `src/modules/billing/stripe-credit-checkout.service.ts`

## Data Ownership

- `AdCampaign` owns campaign copy, placement, budget, targeting fields, and spend totals.
- `AdCreditLedgerEntry` records platform-credit reservations and future grant/spend history.
- `AdDeliveryLog` records impression/click diagnostics for future placement systems.
- `StripeCreditPackage` defines admin-managed purchasable credit bundles.
- `StripeCheckoutFulfillment` prevents duplicate Stripe webhook fulfillment.
- `Membership.platformCredits` remains the current user-facing platform-credit balance.

## Core Workflows

- Eligible user opens Ads from Production Zone.
- User creates a reserved-placement ad campaign.
- Non-admin campaign creation reserves platform credits immediately.
- Admin campaign creation is allowed without credit reservation.
- User can buy platform credits through Stripe Checkout if credit checkout and package price IDs are configured.
- Stripe webhooks grant purchased credits and write ledger entries only after payment is confirmed.
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
- Admin manages Stripe credit packages and price IDs from Stripe Setup.
- Stripe checkout and webhook fulfillment are documented in `docs/modules/27-stripe-billing.md`.

## Diagnostics And Audit

- Campaign creation writes diagnostic and audit logs.
- Delivery logging writes diagnostic-level events.
- Credit reservations write ledger entries.
- Stripe credit checkout creation writes diagnostics.
- Stripe webhook fulfillment writes audit logs and credit ledger entries.
- `StripeCheckoutFulfillment` blocks duplicate webhook deliveries from granting duplicate credits.

## Smoke Checklist

- `/ads` redirects logged-out users to login.
- `/ads/create` blocks accounts without general ad access.
- Campaign creation rejects insufficient platform credits for non-admin users.
- Campaign creation creates an `AdCreditLedgerEntry` reservation.
- Credit package purchase starts Stripe checkout from `/ads`.
- `/ads` disables or hides credit packages that do not have an active Stripe price ID.
- Credit checkout refuses incomplete Stripe setup instead of faking success.
- Completed Stripe payment grants credits once and writes a `StripeCheckoutSession` ledger entry.
- Dashboard shows Phase 21 as Ready and Phase 22 as Next.
