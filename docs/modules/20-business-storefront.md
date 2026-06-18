# Business Storefront

## Purpose

Give Professional accounts a clean public-facing business presence while keeping the control surface private inside Theta-Space.

## User-Facing Surfaces

- `/business-center` for Professional/Admin business profile management.
- `/storefront/[slug]` for public storefront viewing and inquiry submission.
- Production Zone card linking eligible users into Business Center.

## Primary Code Areas

- `src/modules/business-storefront`
- `src/components/business-storefront`
- `src/app/business-center`
- `src/app/storefront/[slug]`
- `src/app/api/business/profile`
- `src/app/api/storefront/[slug]/inquiries`

## Data Ownership

- `BusinessProfile` belongs to one owner user and keeps its slug stable after creation.
- `BusinessInquiry` belongs to one public storefront and captures external inquiry messages.
- Business profile publishing is explicit through `publicStorefrontEnabled`.
- Email linking is represented as a disabled placeholder with `emailLinkingEnabled` for future integration.

## Core Workflows

- Professional/Admin opens Business Center from Production Zone.
- User creates or updates business profile fields.
- User optionally publishes the public storefront.
- Public visitor opens `/storefront/[slug]` and submits an inquiry.
- Owner sees recent inquiries inside Business Center.

## Access Rules

- Business Center edit requires Admin role or the `market.storefront` feature.
- Public storefront only loads if the owner explicitly published it.
- Inquiries can be submitted without member login, but only against published storefronts.

## Integrations

- Production Zone uses this phase as the Business Center destination.
- Future modules should connect ads, storefront listings, jobs, verification, and mail replies.
- External email linking is intentionally only a placeholder in this phase.

## Diagnostics And Audit

- Business profile saves write diagnostic and audit logs.
- Storefront inquiries write diagnostic logs.

## Smoke Checklist

- `/business-center` redirects logged-out users to login.
- Production Zone Business Center card points to `/business-center`.
- Published storefront is visible at `/storefront/[slug]`.
- Unpublished storefront is not publicly visible.
- Public inquiry form creates a `BusinessInquiry`.
