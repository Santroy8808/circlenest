# Stripe Billing

## Purpose

Provide the payment bridge between Theta-Space and Stripe for subscription upgrades and platform credit purchases while keeping real-money fulfillment processor-backed.

## User-Facing Surfaces

- `/settings/subscription` starts Stripe Checkout for membership subscriptions.
- `/ads` starts Stripe Checkout for ad/platform credit packages.
- `/api/billing/checkout` creates subscription checkout sessions.
- `/api/billing/credits/checkout` creates one-time credit purchase checkout sessions.
- `/api/billing/stripe/webhook` verifies Stripe webhooks and fulfills paid results.

## Admin Surfaces

- `/admin/actions/stripe-setup` is the billing setup GUI.
- `/api/admin/stripe-setup` saves connection settings, subscription price IDs, and credit package price IDs.

## Primary Code Areas

- `src/lib/platform/stripe.ts`
- `src/modules/membership-policy/subscriptions.service.ts`
- `src/modules/billing/stripe-admin.service.ts`
- `src/modules/billing/stripe-credit-checkout.service.ts`
- `src/components/admin-moderation/admin-stripe-setup-wizard.tsx`
- `src/components/settings-secure-areas/subscription-checkout-button.tsx`
- `src/components/ads-credits/ad-credit-checkout-button.tsx`
- `src/app/api/billing`
- `src/app/api/admin/stripe-setup`

## Data Ownership

- `StripeIntegrationConfig` stores admin-saved Stripe mode, keys, webhook secret, currency, and checkout enablement.
- `SubscriptionPlanRule.stripePriceId` stores recurring Stripe price IDs for paid membership tiers.
- `StripeCreditPackage` stores one-time credit bundles and their Stripe price IDs.
- `StripeCheckoutFulfillment` prevents duplicate webhook fulfillment for paid checkout sessions.
- `Membership` stores Stripe customer/subscription IDs and subscription status.
- `AdCreditLedgerEntry` records fulfilled credit purchases and ad reservations.

## Core Workflows

- Admin opens Stripe Setup and enters connection data or relies on Railway environment variables.
- Admin assigns Stripe recurring price IDs to Contributor, Professional, Auditor, and Org plans.
- Admin creates or updates credit packages with one-time Stripe price IDs.
- Member clicks an upgrade in Subscription settings.
- Server creates a Stripe Checkout Session in subscription mode.
- Stripe redirects the member back after checkout.
- Stripe webhook updates membership status and effective tier.
- Member clicks a credit package in Ads.
- Server creates a Stripe Checkout Session in payment mode.
- Stripe webhook grants credits exactly once and writes the ledger entry.

## Access Rules

- Only Admin users can open or mutate Stripe Setup.
- Admins may configure checkout inputs but cannot directly create real-money payments or mark payments paid.
- Subscription access changes only through Stripe webhook state or explicit non-money admin status correction.
- Credit purchase balances are granted only through verified Stripe webhook fulfillment.
- Checkout is refused if required Stripe secret/webhook settings or Stripe price IDs are missing.

## Stripe Configuration Contract

Stripe can be configured by Railway env or by Admin Stripe Setup.

Railway env names:

- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_CONTRIBUTOR`
- `STRIPE_PRICE_PROFESSIONAL`
- `STRIPE_PRICE_AUDITOR`
- `STRIPE_PRICE_ORG`

Admin GUI fields:

- Mode: Test or Live.
- Currency.
- Publishable key.
- Secret key.
- Webhook signing secret.
- Subscription checkout enabled.
- Credit checkout enabled.
- Recurring price IDs per paid membership tier.
- One-time price IDs per credit package.

Production webhook endpoint:

- `https://theta-space.net/api/billing/stripe/webhook`

Required Stripe webhook events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Failure Rules

- Missing secret key blocks checkout.
- Missing webhook secret blocks checkout to prevent paid-but-unfulfilled outcomes.
- Missing recurring price ID disables that subscription upgrade.
- Missing credit package price ID disables that package purchase.
- Webhook duplicate delivery is safe because `StripeCheckoutFulfillment.stripeCheckoutSessionId` is unique.
- Webhook errors return JSON errors instead of generic server exceptions.

## Diagnostics And Audit

- Checkout session creation writes diagnostic logs.
- Subscription sync writes audit logs.
- Credit fulfillment writes audit logs and credit ledger entries.
- Stripe Setup changes write audit logs without exposing raw secret values.

## Smoke Checklist

- Admin can find `Billing > Stripe Setup` from `/admin` search.
- Admin can save test keys and price IDs without exposing raw saved secrets on reload.
- `/settings/subscription` shows checkout buttons only for configured eligible plans.
- Org appears only after admin grants Org upgrade eligibility.
- Subscription checkout redirects to Stripe when configured.
- Stripe subscription webhook updates `Membership.subscriptionStatus`.
- `/ads` shows credit packages and disables unconfigured ones.
- Credit checkout redirects to Stripe when configured.
- Stripe credit webhook increments `Membership.platformCredits` once.
- Duplicate webhook delivery does not double-grant credits.
