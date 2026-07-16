# Theta-Space Handoff 2

Generated: 2026-06-25

## Active Workspace

- Active web app repo: `C:\Repos\Theta-Space-net\NewRepo`
- GitHub remote: `https://github.com/Santroy8808/circlenest.git`
- Active branch: `main`
- Current local HEAD: `19a3a6d`
- Production host: user-owned Windows Server
- Production database: self-hosted PostgreSQL
- Media storage: Cloudflare R2
- Production domain: `https://theta-space.net`
- Android wrapper source: `C:\Repos\Theta-Space-net\ThetaSpaceAndroidWrapper`
- APK output folder only: `C:\Users\MikeDeArmon\OneDrive - Santroy\Theta-Space.net\android-apk`

## Non-Negotiable Repo Rules

- Do not use Compass OneDrive as a workspace.
- Do not save APKs or project archives to Compass OneDrive.
- Current live web work happens in `C:\Repos\Theta-Space-net\NewRepo`.
- This repo pushes to GitHub `Santroy8808/circlenest`, branch `main`.
- The Windows production checkout deploys from that GitHub repo.
- PostgreSQL schema changes must be reviewed before production promotion.
- R2 media must stay browser-direct where practical; the Windows web service should not become the heavy media pipe.
- Admins may manage platform settings, credits, privileges, and workflows.
- Admins must not create or manipulate real-money balances outside processor-backed flows.
- Platform credits are internal ledger values.
- Real money comes from Stripe or a future payment processor webhook/batch only.

## Current Worktree State

The worktree is dirty and contains implementation work plus blueprint documentation updates. Do not assume everything is already pushed.

Known modified files include:

- `package.json`
- `package-lock.json`
- `prisma/schema.prisma`
- `scripts/external-services-readiness.ts`
- `docs/external-services-readiness.md`
- `docs/release-candidate.md`
- `docs/modules/03-membership-policy.md`
- `docs/modules/21-ads-credits.md`
- `docs/modules/24-admin-moderation.md`
- `src/app/admin/actions/[actionKey]/page.tsx`
- `src/app/api/membership-policy/matrix/route.ts`
- `src/app/membership/page.tsx`
- `src/app/settings/subscription/page.tsx`
- `src/components/admin-moderation/admin-portal.tsx`
- `src/components/admin-moderation/admin-status-change-wizard.tsx`
- `src/components/ads-credits/ads-manager.tsx`
- `src/components/ads-credits/create-ad-campaign-form.tsx`
- `src/components/business-storefront/business-center-client.tsx`
- `src/components/business-storefront/business-storefront.tsx`
- `src/components/events/event-detail-client.tsx`
- `src/components/platform/app-shell.tsx`
- `src/components/policy/membership-matrix.tsx`
- `src/components/settings-secure-areas/subscription-settings-detail.tsx`
- `src/lib/platform/env.ts`
- `src/modules/admin-moderation/admin-moderation.service.ts`
- `src/modules/admin-moderation/status-change.service.ts`
- `src/modules/ads-credits/ads-credits.service.ts`
- `src/modules/ads-credits/types.ts`
- `src/modules/business-storefront/business-storefront.service.ts`
- `src/modules/business-storefront/types.ts`
- `src/modules/events/events.service.ts`
- `src/modules/events/types.ts`
- `src/modules/fundraisers-funds/fundraisers-funds.service.ts`
- `src/modules/mail/mail.service.ts`
- `src/modules/membership-policy/launch-access.service.ts`
- `src/modules/membership-policy/membership-policy.service.ts`
- `src/modules/membership-policy/policy.ts`
- `src/modules/production-zone/production-zone.service.ts`
- `src/modules/production-zone/types.ts`

Known new files include:

- `docs/modules/27-stripe-billing.md`
- `docs/handoff2.md`
- `prisma/deploy/2026-06-24-org-tier-events.sql`
- `src/app/api/admin/stripe-setup/`
- `src/app/api/billing/`
- `src/app/api/events/[eventId]/external-rsvp/`
- `src/components/admin-moderation/admin-stripe-setup-wizard.tsx`
- `src/components/ads-credits/ad-credit-checkout-button.tsx`
- `src/components/settings-secure-areas/subscription-checkout-button.tsx`
- `src/lib/platform/stripe.ts`
- `src/modules/billing/`
- `src/modules/membership-policy/subscriptions.service.ts`

## Recently Completed Blueprint Updates

The blueprint docs now include Stripe as a first-class module.

Updated docs:

- `docs/modules/27-stripe-billing.md`
- `docs/modules/03-membership-policy.md`
- `docs/modules/21-ads-credits.md`
- `docs/modules/24-admin-moderation.md`
- `docs/external-services-readiness.md`
- `docs/release-candidate.md`

Validation for docs:

- `git diff --check -- docs` passed.
- Only normal Windows CRLF warnings appeared.

## Current Module Blueprint Index

Module blueprints live in `docs/modules`.

- `01-platform-infrastructure.md`
- `01a-feedback-support.md`
- `02-auth-security.md`
- `03-membership-policy.md`
- `04-profile-identity.md`
- `05-my-scientology.md`
- `06-gallery-media-storage.md`
- `07-feed-stream.md`
- `08-social-graph.md`
- `09-notifications-alerts.md`
- `10-chat-messages.md`
- `11-mail.md`
- `12-groups.md`
- `13-group-forum.md`
- `14-group-media-docs.md`
- `15-events.md`
- `16-market.md`
- `17-jobs.md`
- `18-auditors.md`
- `19-production-zone.md`
- `20-business-storefront.md`
- `21-ads-credits.md`
- `22-fundraisers-funds.md`
- `23-writers-corner.md`
- `24-admin-moderation.md`
- `25-settings-secure-areas.md`
- `26-search-discovery.md`
- `27-stripe-billing.md`

## Validation Commands

Use these before pushing web changes:

```powershell
npm run workspace:verify
npm run db:generate
npm run typecheck
npm run lint
npm run build
```

Use these before production promotion:

```powershell
npm run cutover:check
npm run promote:dry-run
npm run services:readiness
```

Known local caveat:

- `npm run env:check` or `npm run services:readiness` can fail locally if `DATABASE_URL` and production service variables are not present.
- Local missing env does not automatically mean production is broken.
- Production readiness still must be verified against the Windows service, PostgreSQL, R2, and Stripe before push/cutover.

## Last Known Validation State

Before the latest documentation-only update, the Stripe/org/event work had passed:

- `npx prisma generate`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

Because additional docs were changed after that, code validation probably does not need a full rerun for docs alone, but before any push to production the full validation list above should be rerun.

## Major Implemented Area: Stripe Billing

Purpose:

- Prepare the whole website for Stripe-backed subscriptions and ad-credit purchases.
- Provide admin GUI configuration so keys and price IDs can be managed without code changes.
- Keep real-money fulfillment processor-backed.

Primary docs:

- `docs/modules/27-stripe-billing.md`
- `docs/modules/03-membership-policy.md`
- `docs/modules/21-ads-credits.md`
- `docs/modules/24-admin-moderation.md`
- `docs/external-services-readiness.md`

Primary code:

- `src/lib/platform/stripe.ts`
- `src/modules/membership-policy/subscriptions.service.ts`
- `src/modules/billing/stripe-admin.service.ts`
- `src/modules/billing/stripe-credit-checkout.service.ts`
- `src/components/admin-moderation/admin-stripe-setup-wizard.tsx`
- `src/components/settings-secure-areas/subscription-checkout-button.tsx`
- `src/components/ads-credits/ad-credit-checkout-button.tsx`
- `src/app/api/billing/checkout/route.ts`
- `src/app/api/billing/credits/checkout/route.ts`
- `src/app/api/billing/stripe/webhook/route.ts`
- `src/app/api/admin/stripe-setup/route.ts`

Stripe configuration surfaces:

- Admin GUI: `/admin/actions/stripe-setup`
- Admin API: `/api/admin/stripe-setup`
- Subscription checkout API: `/api/billing/checkout`
- Credit purchase checkout API: `/api/billing/credits/checkout`
- Webhook API: `/api/billing/stripe/webhook`

Stripe env fallback names:

- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_CONTRIBUTOR`
- `STRIPE_PRICE_PROFESSIONAL`
- `STRIPE_PRICE_AUDITOR`
- `STRIPE_PRICE_ORG`

Webhook endpoint:

- `https://theta-space.net/api/billing/stripe/webhook`

Required webhook events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Important payment boundary:

- Admin Stripe Setup can configure checkout inputs.
- Admin Stripe Setup must not mark a Stripe payment as paid.
- Membership subscription state changes through Stripe webhooks or explicit non-money admin correction.
- Purchased platform credits are granted only through verified Stripe webhook fulfillment.
- Duplicate webhook fulfillment is guarded by `StripeCheckoutFulfillment`.

## Major Implemented Area: Org Tier

Purpose:

- Add hidden `Org` tier that users cannot see in the public membership window by default.
- Admin grants eligibility first.
- User then sees the Org upgrade option and completes Stripe setup.

Org rules:

- Display price: `$9.99 / mo`
- Hidden from ordinary membership selection until admin grants eligibility.
- Can create Groups.
- Can create Events.
- Can create Auditor Profile.
- Can create Fundraiser.
- Can create fundraiser ads with doubled credit value.
- Can send internal mass mail only to people who state that org as their org.
- Has an entity profile similar to business storefront.
- Has org contact email, location, account runner, phone, and blog/profile capability.

Important distinction:

- Admin assigning Org eligibility does not activate the paid Org tier.
- Stripe checkout/webhook activates the actual paid subscription state.

## Major Implemented Area: Events RSVP

Purpose:

- Events should allow RSVP with name and real email submission.

Known new route:

- `src/app/api/events/[eventId]/external-rsvp/`

Next QA:

- Confirm event detail page exposes RSVP clearly.
- Confirm RSVP accepts real name/email.
- Confirm validation blocks missing/invalid email.
- Confirm saved RSVP is visible where event owners/moderators expect it.

## Admin Console Direction

The admin portal should remain card/wizard based.

Rules:

- Admin home is a card list of available actions.
- If a section has multiple functions, show cards that lead to focused function pages.
- The final function page should be a wizard or focused form.
- Avoid piling unrelated forms on one page.
- Admin search should find functions such as Stripe Setup, Status Change, Invite, Ad Spend, Public Announcement, and Reset Password.

Current important admin actions:

- Status Change.
- Platform Credits.
- Public Announcements.
- Stripe Setup.
- Feature Flags.
- Invite generation and invite management.
- Audit viewer.
- Reports queue.
- Business verification.
- View-as-role.

Admin gaps to re-check:

- Reset account password.
- Create user without SMTP.
- Revoke unused invites.
- Collapse used/revoked invites.
- Remove redundant Settings/Admin action cards.

## Mail And Chat Direction

Mail and Chat are separate products.

Mail:

- Should behave like an internal mail client.
- Compose should open a To field with live search.
- Selecting a recipient in To should add them visibly.
- Contacts are separate from Friends.
- Sending to prior contacts, friends, family, and allowed groups should be supported.
- Contributor and Professional can create custom mail groups where allowed by tier policy.
- Mail may later integrate external email, but current mail is internal-first.

Chat:

- Should feel instant even when the server lags.
- Optimistic messages should appear immediately.
- Failed sends should remain visible and marked failed.
- Keyboard should not cover chat history or input.
- Input should attach to top of keyboard on mobile.
- Chat history area should dynamically resize when keyboard opens/closes.
- Latest message should stay visible by default.
- Attachments in Theta-Comm should download/decrypt/save locally before viewing.

Known integration issue to continue watching:

- Desktop-to-Theta-Comm delivery has worked.
- Theta-Comm-to-desktop delivery previously did not reliably appear.
- Both clients must use the same backend message model, thread IDs, delivery status model, and polling/push path.

## Desktop Stream Direction

The main stream is the daily-use heart of the site.

Target behavior:

- Fast independent center feed scrolling.
- Control panel and ad rail stay fixed on desktop.
- Compact OP cards with clear separation between posts.
- Avatar beside poster/commenter/replier.
- Quick reaction button.
- Hover/long-press emoji tray must stay open while selecting.
- Emoji reactions must display the selected emoji, not just increment a count.
- Clicking reaction counts should show who reacted.
- Comment button opens the OP thread and focuses the comment input.
- Replies use reply-arrow icon, not text labels.
- Share arrow should point right.
- Clicking OP opens full thread.
- Full thread view should show all reply layers with expand/collapse by layer.
- Main stream should show only top replies, not bury the feed in full comment trees.
- Posting/commenting/replying should not full-page reload or boot the user out of position.

Known recent stream UX issues:

- Reply composer send button was requested on the same row as RTF buttons.
- Emoji tray was hidden/clipped inside post card overflow.
- Posts were too visually similar and needed better separation.
- Attachment images on stream replies need preview and persistence.
- Stream reply attachments should save to the poster gallery with system tags.

## Gallery And Media Direction

My Pics:

- Simple gallery, not an admin panel.
- Recent-first by default.
- User can click an image and view it in-page, not a new browser tab.
- Image detail has next/previous.
- User can set avatar/banner from image detail.
- User can choose visibility and comment permissions.
- Commenting should be tied into privacy/public setting.
- If comments are enabled, comment UI must be visible and comments should scroll while the image remains in view.

Upload/storage principles:

- Browser gets upload intent.
- Browser uploads directly to R2 where practical.
- Web app records metadata in DB.
- Uploaded gallery images must show preview after refresh.
- Gallery images must be tracked by owner.
- Tags organize photos.
- System date tags are created automatically.
- Albums/tags are organization layers, not separate storage buckets.

Open design question to implement cleanly:

- Resize/compress uploads so raw/full-resolution files do not become uncontrolled storage bloat.
- Older stream/media assets may need compression/archive policy, but avoid breaking viewability.

## Market, Jobs, Ads Direction

Market:

- Product and service listings live here.
- Chronological by default.
- Filterable by category/search.
- Listing cards should be square thumbnails with title/location/price.
- Click listing card to open full listing.
- Static categories only; users should not create arbitrary categories.

Jobs:

- Browsable by all tiers.
- Only Professional should create job listings unless policy changes.
- Job cards should support square cards, wide rows, or compact text based on user preference.
- Cards should show key data before click: location, company, title, remote, salary range.
- Click opens full listing/contact info.

Ads:

- Ads should never be embedded inside listing/event/job detail content.
- Ads use reserved placements.
- Ad creation should support upload image or image URL where appropriate.
- Ad click target can be storefront, listing, blog/article, or external URL.
- External URL click should warn user they are leaving Theta-Space.
- Admin should manage ad costs and credit packages.
- No ads in chat.

## Membership And Tier Direction

Current public/product tiers:

- Free
- Contributor
- Professional
- Auditor
- Admin role separate from tier
- Org hidden/admin-eligible only

Important naming:

- Plus/Activist/Biz references should not remain for current tier names.
- Professional is the current business tier display name.
- Org is hidden unless admin grants upgrade eligibility.

Free:

- Browse jobs and market.
- Should not see create listing controls if not allowed.
- Upgrade prompts only where relevant.

Contributor:

- More storage than Free.
- No internal mass mail.
- No create fundraiser.
- No create events.
- Those moved to Professional unless policy changes.

Professional:

- Business/storefront tools.
- Create ads, jobs, events, fundraisers where configured.
- Business profile/storefront/blog path.

Auditor:

- Can create auditor profile if account/tier allows.

Org:

- Special entity tier, hidden, admin-eligible, Stripe-paid.

## My Scientology Direction

Classification dropdown:

- Public
- Staff
- Sea Org
- Auditor

Training dropdown:

- Not Classed
- Student Hat
- Pro Upper Indoc
- Pro Metering
- Class 0 Auditor through Class VIII Auditor

Processing/Rundowns:

- Purif through OT VIII.

Other fields:

- Good Standing attestation required during onboarding.
- Last Org required during onboarding.
- Last service/course minimum required during onboarding.
- Last 6 of IAS membership number optional.
- Commendation uploads should support image/PDF.
- PDFs should be flattened/safe, not executable/encoded.

Privacy:

- Remove ad/category matching opt-in from My Scientology fields unless explicitly re-approved.

## Onboarding Direction

First sign-in should walk a new user through:

1. Basic profile information: email, full name, location, tagline, bio.
2. My Scientology basics.
3. Optional IAS last-six.
4. Required Good Standing attestation.
5. Required Terms of Service acceptance.

Skippable:

- Profile details.
- Optional My Scientology extras.

Not skippable:

- Good Standing attestation.
- Terms of Service.

If user says they are not in good standing:

- Stop with a neutral thank-you/application message.
- Do not allow normal platform access.

## Settings Direction

Settings should be card/action based.

Security:

- Requires password prompt.
- Session should remain unlocked for active user for about 5 minutes.
- Idle/logout resets secure prompt.
- Needs real functions, not placeholder cards:
  - Reset password.
  - Blocked users.
  - Sessions.
  - Security events.

Subscription:

- View current subscription.
- Upgrade/downgrade actions.
- Billing history.
- Download billing by month.
- Stripe checkout integration.

Photos:

- My Pics should not be behind secure settings wall.

Back navigation:

- Settings subpages need a clear back button.

Avatar:

- Clicking avatar image should open the full image in My Pics gallery.

## Production Deployment Flow

Expected flow:

1. Work and QC in active web repo.
2. Validate locally.
3. Back up current production GitHub state with archive tag.
4. Push `main` to GitHub.
5. The Windows production server deploys from GitHub.
6. The application talks to self-hosted PostgreSQL.
7. App media talks to Cloudflare R2.
8. Stripe webhooks talk to `/api/billing/stripe/webhook`.

Before production push:

```powershell
npm run workspace:verify
npm run db:generate
npm run typecheck
npm run lint
npm run build
npm run cutover:check
npm run promote:dry-run
```

Before schema-changing production deployment:

- Review `prisma/schema.prisma`.
- Review `prisma/deploy/2026-06-24-org-tier-events.sql`.
- Confirm PostgreSQL backup or rollback posture.
- Confirm migrations/status against production connection.
- Do not assume SQLite behavior.

Rollback:

- Tag current production before overwrite as `archive-YYYY-MM-DD.vN`.
- If smoke fails, rollback only to explicit archive tag after approval.

## External Services Checklist

Windows production server:

- Confirm GitHub source is `Santroy8808/circlenest`.
- Confirm production branch is `main`.
- Confirm build runs `prisma generate` and `next build`.
- Confirm runtime logs after deploy do not show server-side exception digests.

PostgreSQL:

- Confirm `DATABASE_URL` points to the self-hosted PostgreSQL instance.
- Confirm schema changes are applied.
- Confirm test/admin users exist if needed.
- Confirm subscription/Stripe tables exist before testing billing.

Cloudflare R2:

- Confirm bucket env vars are present.
- Confirm CORS allows browser upload from `theta-space.net`.
- Confirm upload intent returns signed URL.
- Confirm direct upload writes object.
- Confirm complete-upload saves DB row.
- Confirm public URL renders after refresh.

Stripe:

- Confirm recurring prices for Contributor, Professional, Auditor, Org.
- Confirm one-time prices for platform credit packages.
- Confirm webhook endpoint is configured.
- Confirm webhook signing secret is set.
- Confirm required webhook events are enabled.
- Confirm subscription checkout updates PostgreSQL.
- Confirm credit checkout increments platform credits once.
- Confirm duplicate webhook does not double-grant credits.

SMTP:

- Invite email send has been unreliable and needs live verification.
- Do not commit SMTP credentials into repo.
- SMTP settings belong in environment/config, not source.
- Admin should be able to create users without SMTP as fallback.

## Browser QC Baseline Needed

The user wants real browser click testing, not CLI-only confidence.

Use live site for speed baseline when requested:

- `https://theta-space.net`

Use local only for implementation checks:

- `http://localhost:3100`

Minimum users for smoke interaction:

- Admin
- Mike
- Jules
- Sally

Needed UX timing log:

- Page load time.
- Button click to UI response.
- Form submit to visible success/error.
- Message send to optimistic display.
- Message send to recipient visibility.
- Upload select to progress.
- Upload complete to gallery visibility.
- Stream post/comment/reply to visible update.
- Mail compose/search/send flow.
- Notification mark-read flow.

Test passes requested:

1. Browser UX logging pass.
2. Fix issues one by one.
3. Retest and compare.
4. Repeat up to 3 cycles.

## Known High-Priority Follow-Ups

1. Verify current dirty Stripe/org/event work still passes full validation.
2. Review Prisma schema and migration SQL before the PostgreSQL deployment.
3. Finish live Stripe setup GUI smoke with test keys and price IDs.
4. Confirm Org hidden tier appears only after admin eligibility grant.
5. Confirm subscription checkout and webhook state transitions.
6. Confirm credit checkout and duplicate webhook guard.
7. Fix invite SMTP or provide reliable admin-create-user fallback.
8. Finish notification mark-read individual and bulk actions if not already stable.
9. Re-test gallery image detail, comments, avatar/banner selection, previews, and R2 direct upload.
10. Re-test desktop messages, attachments, optimistic send, and Theta symbol delivery status.
11. Re-test Theta-Comm bidirectional delivery with desktop messages.
12. Re-test stream thread depth, emoji reaction tray, reaction display, and attachment previews.
13. Re-test admin search and card/wizard separation.
14. Re-test Settings subpages for real function, not placeholders.
15. Re-test Production Zone and Business Center routing with tier-specific visibility.

## Do Not Forget

- The user strongly prefers finished features over shells.
- If a button exists, it must do the real thing.
- No placeholder handlers.
- No fake success messages.
- No `coming soon` behavior unless explicitly approved.
- Forms should not be dumped onto control-panel pages.
- Use cards for navigation and focused wizards for actions.
- The main social stream matters more than adding more modules.
- The platform must feel fast even if backend work happens after optimistic UI updates.
- Dark glass sci-fi Theta-Space theme should stay consistent.
- Avoid boxes inside boxes and noisy borders.
- Mobile and APK experiences must not be treated as desktop pages squeezed into a phone.
