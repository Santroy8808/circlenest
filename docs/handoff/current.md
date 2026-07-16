# Current Theta-Space Handoff

Updated: 2026-07-09

## First Instructions For The Next Thread

1. Work in `C:\Repos\Theta-Space-net\NewRepo`.
2. Read `docs/handoff/context-index.md` before opening code.
3. Read `docs/feature-completion-standard.md` before declaring work complete.
4. Do not push to GitHub or update production unless the user explicitly says `push`.
5. If the user says `push`, follow `docs/server-update-quick-reference.md`: push GitHub, then SSH to the production Windows server and pull/rebuild/restart there.

## Active Branch And Dirty State

- Branch: `main`
- Status at this handoff: local worktree is dirty.
- The current unpushed work is ad wizard targeting and destination improvements.

Known modified files:

- `prisma/schema.prisma`
- `src/app/globals.css`
- `src/components/ads-credits/create-ad-campaign-form.tsx`
- `src/components/auth/login-form.tsx`
- `src/modules/ads-credits/ads-credits.service.ts`
- `src/modules/ads-credits/types.ts`

Known new files:

- `prisma/migrations/20260709143000_expand_ad_targeting/migration.sql`
- `src/app/api/ads/targeting/hashtags/route.ts`
- `docs/handoff/README.md`
- `docs/handoff/context-index.md`
- `docs/handoff/current.md`
- `docs/handoff/snapshots/2026-07-09-ad-targeting.md`

## Latest User Request Being Completed

The latest implemented request before this handoff:

- In the ad creation wizard destination step, cards for Storefront, Listing, Article, and URL should include helpful actions to create that destination.
- Destination step text should explain where traffic goes when the ad is clicked.
- The wizard should save progress when leaving to create a storefront/listing/article and allow return.
- Ad targeting should support age ranges, male/female, at least 40 categories, and hashtag targeting.
- Hashtags should be searchable and target people who used or have used those hashtags.

## Current Implementation Summary

### Ad Wizard UI

File: `src/components/ads-credits/create-ad-campaign-form.tsx`

Implemented:

- Destination step title now says: `Choose where the ad opens when clicked`.
- Destination helper text now explains:
  - the ad routes traffic when clicked;
  - cards set the destination category;
  - users can create missing destinations from the card;
  - users select existing storefront/listing/article/URL from the relevant control.
- Destination cards now include:
  - Storefront: `Create one` link to `/business-center/storefront?...`
  - Listing: `Create one` link to `/market/create?...`
  - Article: `Create one` link to `/writers-corner/create?...`
  - URL: `Enter URL` action
- Wizard draft is persisted in browser local storage under:
  - `theta-space.ad-wizard.draft.v1`
- Draft restore is skipped when an explicit `initialDraft` is supplied.
- Draft is cleared after successful publish.

### Ad Targeting UI

File: `src/components/ads-credits/create-ad-campaign-form.tsx`

Implemented:

- Location targeting.
- Age range targeting:
  - `13-17`
  - `18-24`
  - `25-34`
  - `35-44`
  - `45-54`
  - `55-64`
  - `65+`
- Sex targeting:
  - `MALE`
  - `FEMALE`
- Interest targeting now allows up to 12 selected categories.
- Hashtag targeting:
  - search input
  - `Add` button
  - Enter key support
  - live suggestions from `/api/ads/targeting/hashtags`
  - removable selected hashtags
- Preview now shows a targeting filter count instead of only interest filter count.

### Styling

File: `src/app/globals.css`

Implemented:

- Destination card/action styling.
- Compact audience card layout.
- Hashtag row, suggestions, and selected tag styling.
- Responsive rules for the new audience grid.

### Database And Validation

Files:

- `prisma/schema.prisma`
- `prisma/migrations/20260709143000_expand_ad_targeting/migration.sql`
- `src/modules/ads-credits/types.ts`

Implemented:

- Expanded `InterestCategory` enum with 40+ new targeting categories.
- Added `AdCampaign.targetAgeRanges String[] @default([])`.
- Added `AdCampaign.targetSexes String[] @default([])`.
- Added `AdCampaign.targetHashtags String[] @default([])`.
- Added validation for:
  - target age ranges
  - target sexes
  - normalized target hashtags
- Added `normalizeAdTargetHashtag()`.

### Hashtag Targeting API

File: `src/app/api/ads/targeting/hashtags/route.ts`

Implemented:

- Authenticated GET route.
- Query param: `q`.
- Returns up to 12 hashtag suggestions from `prisma.hashtag`.
- Response shape:

```json
{
  "hashtags": [
    { "value": "dogs", "label": "#dogs" }
  ]
}
```

### Ad Delivery

File: `src/modules/ads-credits/ads-credits.service.ts`

Implemented:

- Campaign cards include age, sex, and hashtag targeting arrays.
- Campaign creation persists age, sex, and hashtag targets.
- Ad delivery now considers hashtag targeting using existing `UserHashtagSignal` data.
- Campaigns with no interests and no hashtags remain broadly eligible.
- Campaigns with hashtag targets match viewers with corresponding hashtag signals.

Important limitation:

- Age and sex selections are stored on campaigns but are not enforced in delivery yet because the current profile schema does not contain reliable age or sex fields. Do not invent that mapping without a real profile data model and privacy decision.

## Verification Already Run

All passed on 2026-07-09:

```powershell
npx prisma format
npx prisma generate
npm run typecheck
npm run lint
npm run build
```

Production build passed and generated all routes successfully.

## Not Done Yet

- Changes are not pushed to GitHub.
- Changes are not deployed to the production Windows server.
- Prisma migration has not been applied to production.
- Browser visual verification of the ad wizard has not been performed after the latest UI changes.
- Age/sex delivery enforcement is intentionally not implemented yet because user profile fields are missing.

## Recommended Next Steps

If continuing implementation locally:

1. Start the local app.
2. Open `/business-center/create-ad`.
3. Verify the wizard flow visually:
   - destination cards;
   - create-one links preserve draft;
   - existing listing dropdown works;
   - URL selection works;
   - audience fields fit without crowding;
   - hashtag search returns suggestions when matching hashtags exist.
4. Create a test campaign with:
   - one interest category;
   - one hashtag;
   - one age range;
   - one sex;
   - listing destination.
5. Confirm the campaign record contains the new targeting arrays.
6. Only after user says `push`, commit, push, then update production server.

If user asks to make age/sex targeting actually affect ad delivery:

1. Add or identify authoritative profile fields for birthdate/age range and sex.
2. Decide visibility/privacy rules for using those fields in ad targeting.
3. Add DB fields and migration if missing.
4. Add profile/settings UI for users to set the data.
5. Update ad scheduler/delivery to match those fields.
6. Add tests or smoke scripts for matching behavior.

## Product Rules To Preserve

- User has repeatedly said not to push unless explicitly told.
- Theta-Space is intentionally invite-only. Do not treat the absence of open public registration as a defect.
- When explicitly told `push`, also update the production server.
- Do not create placeholder pages or fake success flows.
- Feature completion requires real UI, backend, persistence, permissions, and verification.
- Desktop is priority #1.
- Android is priority #2.
- iOS is not a current priority.
- Free tier must retain core functions in `docs/core-functions.md`.
- Gold triangle remains the standard default Like reaction; do not replace it because of tester comments.
- Standard send glyph is the gold theta/spark/arrow design.
- Light and dark mode both matter; do not leave dark-only cards in light mode.

## Subsequent Product-Readiness Audit

Snapshot: `docs/handoff/snapshots/2026-07-09-product-readiness-audit.md`

Implemented locally:

- The login-page `Have an invite?` link now opens `/signup` in a new tab with `noopener noreferrer`.

Verification passed after that change:

```powershell
npm run workspace:verify
npm run lint
npm run typecheck
npm run build
```

No push or deployment was performed.

## External Services

- Production site: `https://theta-space.net`
- Production server: Windows Server 2022 at `207.188.9.139`
- Media storage: Cloudflare R2
- Media custom domain work was being discussed for `media.theta-space.net`
- Do not assume Railway/Neon is current production; the project moved toward the user-owned Windows server.

## Safe Resume Prompt For A New Thread

Use this if starting a new Codex thread:

```text
Read C:\Repos\Theta-Space-net\NewRepo\docs\handoff\current.md, then C:\Repos\Theta-Space-net\NewRepo\docs\handoff\context-index.md. Continue from the current dirty worktree. Do not push unless I explicitly say push. Verify locally before reporting completion.
```
