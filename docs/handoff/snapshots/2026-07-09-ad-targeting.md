# Snapshot: Ad Wizard Destination And Targeting

Date: 2026-07-09

## Scope

This snapshot records the current ad wizard work so a future thread can continue without relying on chat history.

## User Intent

The user wants ad creation to feel guided and useful, not like a raw form. Each step should explain what the user is doing, fit cleanly on the page, and end with a clear preview before publishing.

Specific user requirements:

- Destination step cards: Storefront, Listing, Article, URL.
- Each destination card needs a creation path if the user does not already have that item.
- Clicking a card sets the destination category.
- If the user already has a destination, select it from a dropdown.
- The wizard should preserve progress when leaving to create a missing destination.
- Targeting should include age ranges, male/female, and at least 40 categories.
- Hashtags should be searchable and target users who have used or interacted with those hashtags.

## Files Changed

### Schema And Migration

- `prisma/schema.prisma`
- `prisma/migrations/20260709143000_expand_ad_targeting/migration.sql`

Changes:

- Added many `InterestCategory` enum values.
- Added arrays to `AdCampaign`:
  - `targetAgeRanges`
  - `targetSexes`
  - `targetHashtags`

### Types And Validation

- `src/modules/ads-credits/types.ts`

Changes:

- Expanded `interestCategoryLabels`.
- Added age range options.
- Added sex options.
- Added hashtag normalization.
- Expanded `createAdCampaignSchema`.
- Expanded `AdCampaignCardView`.

### Service Logic

- `src/modules/ads-credits/ads-credits.service.ts`

Changes:

- Campaign creation saves age, sex, and hashtag targets.
- Campaign card serialization returns age, sex, and hashtag targets.
- Delivery eligibility checks interest matches and hashtag signal matches.

Known limitation:

- Age and sex targets are stored but not used in delivery because no reliable user age/sex fields exist in `Profile`.

### Hashtag Search API

- `src/app/api/ads/targeting/hashtags/route.ts`

Changes:

- New authenticated endpoint for hashtag suggestions.

### Wizard UI

- `src/components/ads-credits/create-ad-campaign-form.tsx`

Changes:

- Destination helper copy rewritten.
- Destination cards include create/enter actions.
- Local storage draft persistence.
- Audience step expanded:
  - location
  - age ranges
  - sex
  - hashtags
  - interests
  - subscriber audience
- Preview targeting count updated.

### CSS

- `src/app/globals.css`

Changes:

- Destination card styles.
- Audience target card styles.
- Hashtag selected/suggestion styles.
- Responsive audience layout.

## Verification

Passed:

```powershell
npx prisma format
npx prisma generate
npm run typecheck
npm run lint
npm run build
```

## Deployment Status

Not pushed.

Not deployed.

Production migration not applied.

## Risks

- Destination create links assume the target creation pages respect `next=...`. If those pages do not already redirect back after save, the draft is still preserved locally but the return flow may need route-specific polish.
- Hashtag delivery relies on existing `UserHashtagSignal` records. If signals are sparse, hashtag targeting will initially have limited reach.
- Age/sex targeting requires future profile schema and privacy work before delivery can enforce it.

## Suggested QA

1. Open `/business-center/create-ad`.
2. Select each destination card.
3. Click each `Create one` action and confirm wizard draft remains when returning.
4. Search hashtag suggestions with a known hashtag.
5. Add and remove hashtags.
6. Select age range and sex filters.
7. Publish a campaign in dev.
8. Confirm DB fields are populated:
   - `AdCampaign.targetAgeRanges`
   - `AdCampaign.targetSexes`
   - `AdCampaign.targetHashtags`
9. Confirm ad delivery does not crash when campaigns have hashtag targeting.
