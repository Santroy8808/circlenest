# Fundraisers Funds

## Purpose

Support member fundraiser campaigns while keeping platform credits, processor-backed money, and admin powers sharply separated.

## User-Facing Surfaces

- `/fundraisers` for fundraiser browsing.
- `/fundraisers/create` for focused campaign creation.
- `/fundraisers/[campaignId]` for campaign detail and contribution intent capture.
- Production Zone browse card for eligible Contributor/Professional accounts.

## Primary Code Areas

- `src/modules/fundraisers-funds`
- `src/components/fundraisers-funds`
- `src/app/fundraisers`
- `src/app/api/fundraisers`

## Data Ownership

- `FundraiserCampaign` owns campaign copy, category, goal, status, and creator.
- `FundContributionIntent` records member intent without claiming money moved.
- `FundLedgerEntry` is reserved for processor-confirmed append-only events.
- No admin-facing code can mutate real-money balances directly in this phase.

## Core Workflows

- Eligible member browses fundraiser campaigns.
- Contributor/Professional/Admin creates a campaign subject to tier limits.
- Member opens a campaign detail page.
- Member records a contribution intent.
- Future processor integration can convert processor webhooks into append-only ledger entries.

## Access Rules

- Contributor can create one fundraiser per month.
- Professional can create without the monthly cap.
- Admin can create/manage campaign records, but no real money balance mutation is exposed.
- Contribution intents require login and do not process payment.

## Integrations

- Membership policy supplies fundraiser limits.
- Future Stripe integration should write processor-backed ledger entries only from webhook/batch flows.
- Admin moderation can review campaigns without creating money.
- Ads can later promote fundraiser campaigns through the ads module.

## Diagnostics And Audit

- Campaign creation writes diagnostic and audit logs.
- Contribution intent creation writes diagnostic logs.
- Ledger table is append-only by product rule; update/delete surfaces should not be added.

## Smoke Checklist

- `/fundraisers` redirects logged-out users to login.
- Contributor monthly limit is enforced server-side.
- Professional has no monthly fundraiser cap.
- Detail page records contribution intent without processor claims.
- Dashboard shows Phase 22 as Ready and Phase 23 as Next.
