# Membership Policy

## Purpose

Define which account tiers can see, create, moderate, invite, advertise, and manage resources.

Free-tier access is anchored by `docs/core-functions.md`. The Free tier keeps chronological Stream posting, group creation/posting and moderator assignment, messages and group messages, one active personal Market listing, job listings, Auditor Directory browsing, and Gallery. Stream filter controls, support requests, business profiles, identity switching, Events, and auditor-profile creation are not Free features.

Contributor is a separate community tier. Contributors retain core social use, Groups, personal Market listing creation/editing, and Writers Corner. Contributors do not receive Business Center/storefront administration, business identity switching, Jobs, Events, Fundraisers, general ad creation, or auditor-profile creation. These unavailable capabilities must be hidden rather than shown as disabled controls or upgrade gates.

Free and Contributor are the only operational membership tiers. Professional, Auditor, and Org remain defined for future work but are disabled, excluded from all member-facing matrices and checkout choices, unavailable for admin assignment or promotional grants, and resolved to Free access if an old database record still references one of them.

## User-Facing Surfaces

- `/membership` authenticated current-membership summary.
- `/settings/subscription` authenticated current subscription state.
- Tier-aware controls that remain hidden when unavailable, except explicitly labeled Coming Soon surfaces.
- Admin override tooling for operational tiers.

## Primary Code Areas

- `src/modules/membership-policy`
- `src/components/policy`
- `src/components/settings-secure-areas/subscription-settings-detail.tsx`
- `src/components/settings-secure-areas/subscription-checkout-button.tsx`
- `src/app/api/billing/checkout`
- `src/app/api/billing/stripe/webhook`
- `src/lib/platform/feature-flags`

## Data Ownership

- `Membership`
- `MembershipTierUpgradeEligibility`
- `SubscriptionPlanRule`
- `StripeIntegrationConfig`
- `StripeCheckoutFulfillment`
- `FeatureFlag`
- `MembershipPolicyOverride`
- future invite exception tables.

## Core Workflows

- Resolve effective access from tier, role, flags, account capabilities, and admin overrides.
- Gate UI and APIs consistently.
- Support future tiers without brittle string checks.
- Create subscription checkout sessions for eligible Contributor accounts.
- Sync subscription state from Stripe webhooks.

## Implemented Slice

- Central tier matrix in `src/modules/membership-policy/policy.ts`.
- Effective policy resolution with role, tier, and per-user overrides.
- Shared hidden-capability enforcement across Contributor navigation, pages, web/mobile APIs, and Writers Corner storefront publishing controls.
- Audit-logged policy override service.
- Admin account management can individually grant or revoke membership-invite creation and the separate bulk-invite capability.
- Bulk invitation delivery is queued, paced at one email every two minutes, limited to 250 addresses per batch and 300 addresses per UTC day, and each recipient receives a unique one-time code.
- `invites.bulkSend` is an individual account override, not a normal tier entitlement; keep it off in global tier policy and grant it only through the audited Status Change workflow.
- The existing `npm run worker` process must be supervised in the deployment environment for queued email jobs to run; do not treat a queued batch as delivered until its status reports sent messages.
- Membership tier alone does not grant invitations; Admin and individually approved accounts can create them.
- Contributor no longer grants storefront, business identity, or auditor-profile creation.
- Free Market enforcement allows one active listing at a time rather than a rolling creation allowance.
- Support requests are available to Contributor and admins, but not Free accounts.
- Events, fundraisers, mass mail, and auditor-profile creation remain hidden until operational.
- Stripe-ready subscription checkout for Contributor.
- Stripe webhook sync for active, trialing, past-due, canceled, and unpaid subscription states.
- Disabled tiers cannot be activated through checkout, webhook delivery, promotional access, admin status correction, or global tier overrides.
- Public matrix API at `/api/membership-policy/matrix`.
- Authenticated feature evaluation API at `/api/membership-policy/evaluate`.
- Current-membership page at `/membership`.
- Current subscription-status page at `/settings/subscription`; unavailable upgrade choices are not displayed.
- Billing endpoints at `/api/billing/checkout` and `/api/billing/stripe/webhook`.
- Admin Stripe setup endpoint at `/api/admin/stripe-setup`.

## Access Rules

Admin role bypasses feature gates only where appropriate. Paid tier never grants admin role.

## Integrations

All creation modules, admin, invitations, ads, storage, and settings.

## Current Design Notes

Stripe plan activation is processor-backed. Admins can directly correct membership between Free and Contributor. Professional, Auditor, and Org are not selectable and cannot be activated while disabled.

Stripe setup is shared with `docs/modules/27-stripe-billing.md`. Required production-server Stripe variables:

- `STRIPE_PUBLISHABLE_KEY` optional if saved through admin Stripe Setup
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_CONTRIBUTOR`

These may be replaced or supplemented by Admin Stripe Setup for saved keys and price IDs. Checkout still refuses to start unless the secret key, webhook secret, and target price ID are available.

## Smoke Checklist

- Tier matrix checks cover the active Free and Contributor tiers and confirm Free keeps the core functions in `docs/core-functions.md`.
- Public matrices, subscription choices, admin status correction, promotional grants, and Stripe activation exclude Professional, Auditor, and Org.
- Contributor checks confirm Market, Groups, and Writers Corner remain usable while Business Center, Jobs, Events, Fundraisers, general ads, and auditor-profile creation remain hidden.
- Direct restricted page and API requests return generic not-found responses without exposing feature-specific upgrade details.
- Locked controls never submit privileged API actions.
- `/membership` and `/settings/subscription` show only the member's current access, not unavailable tiers or controls.
- Checkout refuses tiers without Stripe price IDs instead of faking success.
- Stripe webhook updates `Membership.subscriptionStatus`, Stripe IDs, billing period end, and effective tier.
- Admin Stripe Setup can update subscription price IDs without code changes.
