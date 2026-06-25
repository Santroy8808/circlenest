# Membership Policy

## Purpose

Define which account tiers can see, create, moderate, invite, advertise, and manage resources.

## User-Facing Surfaces

- `/membership` public membership comparison.
- `/settings/subscription` authenticated subscription state and upgrade checkout.
- Tier-aware controls and upgrade prompts across feature surfaces.
- Admin override and Org eligibility tooling.

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
- Create subscription checkout sessions for eligible paid tiers.
- Sync subscription state from Stripe webhooks.
- Reveal hidden Org subscription only after admin grants eligibility.

## Implemented Slice

- Central tier matrix in `src/modules/membership-policy/policy.ts`.
- Effective policy resolution with role, tier, and per-user overrides.
- Audit-logged policy override service.
- Stripe-ready subscription checkout for paid membership tiers.
- Stripe webhook sync for active, trialing, past-due, canceled, and unpaid subscription states.
- Hidden Org upgrade eligibility that admins can reveal without activating the tier directly.
- Public matrix API at `/api/membership-policy/matrix`.
- Authenticated feature evaluation API at `/api/membership-policy/evaluate`.
- Membership comparison page at `/membership`.
- Subscription checkout page at `/settings/subscription`.
- Billing endpoints at `/api/billing/checkout` and `/api/billing/stripe/webhook`.
- Admin Stripe setup endpoint at `/api/admin/stripe-setup`.

## Access Rules

Admin role bypasses feature gates only where appropriate. Paid tier never grants admin role.

## Integrations

All creation modules, admin, invitations, ads, storage, and settings.

## Current Design Notes

Normalize `Professional` as the business tier display name.

Stripe plan activation is processor-backed. Admins can directly correct ordinary membership status, but Org is a hidden upgrade option: an admin grants `MembershipTierUpgradeEligibility`, the member sees Org on the subscription page, and Stripe checkout/webhooks activate or deactivate the actual tier.

Stripe setup is shared with `docs/modules/27-stripe-billing.md`. Required Railway Stripe variables:

- `STRIPE_PUBLISHABLE_KEY` optional if saved through admin Stripe Setup
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_CONTRIBUTOR`
- `STRIPE_PRICE_PROFESSIONAL`
- `STRIPE_PRICE_AUDITOR`
- `STRIPE_PRICE_ORG`

These may be replaced or supplemented by Admin Stripe Setup for saved keys and price IDs. Checkout still refuses to start unless the secret key, webhook secret, and target price ID are available.

## Smoke Checklist

- Tier matrix tests cover Free, Contributor, Professional, Auditor, Admin.
- Locked controls never submit privileged API actions.
- `/settings/subscription` shows only public paid tiers plus hidden Org when admin-approved.
- Checkout refuses tiers without Stripe price IDs instead of faking success.
- Stripe webhook updates `Membership.subscriptionStatus`, Stripe IDs, billing period end, and effective tier.
- Admin Stripe Setup can update subscription price IDs without code changes.
