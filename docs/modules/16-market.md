# Market

## Purpose

Provide The Market as a clean marketplace of clickable product/service thumbnails.

## User-Facing Surfaces

- Browse grid at `/market`.
- Listing detail at `/market/[listingId]`.
- Create listing wizard at `/market/create`.

## Primary Code Areas

- `src/modules/market`
- `src/components/market`
- `src/app/market`
- `src/app/api/market`

## Data Ownership

- `MarketListing` owns listing data and tier expiration.
- `MarketListingPhoto` links listing photos to `MediaAsset`.
- Static category enum prevents user-created category sprawl.

## Core Workflows

- Browse thumbnail cards with title and price only.
- Open full detail page for description, photos, and seller.
- Upload listing photos directly to R2 before listing creation.
- Contributor has limited 14-day listing slots and capped photos.
- Professional has unlimited listing slots and storefront handoff.
- Promote listing through future ad system only; no ads inside listing bodies.

## Access Rules

- Free browses only and sees no create-listing controls.
- Contributor can create within the 14-day posting limit.
- Professional can create unlimited listings.
- Auditor does not create Market listings unless given an override.
- Admin can create for platform testing/operations.

## Integrations

- Membership policy.
- Cloudflare R2 media.
- Business storefront later.
- Ads handoff later.
- Production Zone later.

## Current Design Notes

No user-created categories. Ads are separate placements, not inside listing bodies.

## Smoke Checklist

- Free sees no create controls.
- Listings are square thumbnails with title and price.
- Listing detail is clickable and contains full description/seller details.
- Contributor limits are enforced server-side.
- Create wizard limits photos by tier.
- Ads are represented only as handoff notes, not embedded content.
