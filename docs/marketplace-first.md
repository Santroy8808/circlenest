# Marketplace-First Theta-Space

## Purpose

Theta-Space is centered on finding and publishing offers and wanted requests for Scientologists. The unified Marketplace covers:

- Goods
- Vehicles
- Homes and apartments for rent
- Services
- Jobs
- Auditors and auditing services

Community features remain available, but the Marketplace is the primary signed-in and signed-out destination while `marketplace.focused_rollout` is enabled.

## Member Experience

- `/marketplace` is the searchable directory. It supports offer/wanted intent, listing type, category, keyword, location, remote, price, and sort filters.
- `/marketplace/new` is the category-aware listing wizard. Members can save drafts or publish.
- `/marketplace/manage` contains editing, status changes, renewal, and listing activity.
- `/marketplace/saved` contains saved listings and saved searches with alert frequency controls.
- `/marketplace/interactions` tracks listing conversations, two-party completion, and verified-exchange reviews.
- `/marketplace/legacy` is the read-only archive for records from the previous Market and Jobs systems.

The publishing wizard adapts to the listing type. It uses the shared taxonomy in `src/modules/marketplace/marketplace-taxonomy.ts`, so browsing and publishing use the same primary categories and subcategories. For example, vehicles include year, make, model, mileage, title, accident, service, and feature fields; rentals include rent, deposit, rooms, area, availability, lease, utility, amenity, and accessibility fields; jobs include company, arrangement, employment type, compensation, schedule, responsibilities, requirements, benefits, dates, application instructions, and skills.

## Safety And Privacy

- Private contact fields are stored separately from public visibility choices.
- Exact addresses and VINs are hidden unless the publisher explicitly chooses to show them.
- Private and internal attributes are removed from public listing payloads and search facets.
- Jobs and rentals reject religious-preference fields.
- Regulated-goods offers require a compliance attestation.
- Auditor offers require a qualifications attestation.
- Theta-Space records inquiries and exchanges but does not process buyer-to-seller payment or guarantee member-created listings.
- Reviews require a recorded exchange and independent completion confirmation from both participants.

## Data Model

The unified records are `MarketplaceListing`, `MarketplaceListingMedia`, `MarketplaceListingFacet`, `MarketplaceInquiry`, `MarketplaceSavedListing`, `MarketplaceSavedSearch`, `MarketplaceInteraction`, `MarketplaceReview`, `MarketplaceListingEvent`, and `MarketplaceFeeLedgerEntry`.

`MarketplaceListing.attributes` holds type-specific structured details. Publicly filterable scalar values are duplicated into `MarketplaceListingFacet` so filtering does not depend on ad hoc JSON parsing. Media references use the existing `MediaAsset` and R2 upload-intent flow.

Every lifecycle change writes an event. Every publish/renew action also writes a fee-ledger record, including waived charges. Publishing is free during this rollout; the ledger and pricing-rule design reserve a future paid-listing path without enabling it.

## Search And Background Work

PostgreSQL full-text search and trigram indexes support title, summary, description, category, publisher, and location discovery. Search uses cursor pagination and stable sorting.

The existing platform worker:

- Expires listings when `expiresAt` passes.
- Processes due saved searches.
- Avoids duplicate alerts through saved-search match records.

## Directory And Legacy Data

Official church and auditor directory profiles remain searchable through the dedicated directory. They are not shown as member-created Marketplace inventory. A church, group, auditor, or business may create its own account and publish independent listings.

Existing legacy Market and Job records remain untouched and visible through `/marketplace/legacy`. New records are created only in the unified Marketplace.

## Access And Limits

Marketplace browse, interaction, and publishing use the existing membership policy service. Administrators bypass member caps. Member active-listing, rolling publication, and media caps continue to come from the effective tier policy. The UI displays the signed-in account's current media cap.

The entire marketplace-first surface is controlled by `marketplace.focused_rollout`. When disabled, v2 routes return unavailable responses, unified pages redirect, and the previous navigation and home behavior remain active.

## API

All new endpoints are under `/api/v2/marketplace`:

- Listing search, create, read, update, publish, renew, save, and status changes
- Inquiry creation
- Interaction list, confirm, cancel, and review
- Saved listing and saved-search management
- Category templates and create-state information
- Authorized media upload intent and completion
- Read-only legacy listing access

API handlers use the existing authentication, feature-flag, membership-policy, media, diagnostics, notification, and chat services.

## Beta Inventory

`npm run db:seed:marketplace-beta -- --confirm` creates deterministic sample inventory for every primary category. The default is 72 listings per category, equal to three 24-card result pages. Re-running the command is idempotent because listing, media, facet, and event identifiers are deterministic.

All generated records use the internal `beta_test` marker. Marker fields are removed from public API views. `npm run db:cleanup:marketplace-beta` is count-only; add `-- --confirm` to delete only records that have both the beta identifier prefix and the `beta_test` marker. Always take a database backup before running confirmed cleanup in production.
