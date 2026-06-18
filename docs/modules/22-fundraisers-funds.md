# Fundraisers Funds

## Purpose

Support fundraiser campaigns and payment-ready financial boundaries.

## User-Facing Surfaces

- Fundraiser list.
- Fundraiser detail.
- Create fundraiser wizard.
- Wallet/withdrawal surfaces later.

## Primary Code Areas

- `src/modules/fundraisers-funds`
- `src/components/fundraisers`
- `src/components/funds`

## Data Ownership

- future fundraiser, comment, wallet, ledger, withdrawal tables.

## Core Workflows

- Create fundraiser by tier.
- Comment/discuss.
- Separate platform credits from real money.
- Track withdrawals through processor-backed batches.

## Access Rules

Contributor monthly limits. Professional expanded limits. Admin cannot create/manipulate real money balances.

## Integrations

Payments, ads, admin, reports, alerts.

## Current Design Notes

Prepare for Stripe but keep processor abstraction.

## Smoke Checklist

- Ledgers append only.
- Admin actions cannot mutate real-money balance directly.

