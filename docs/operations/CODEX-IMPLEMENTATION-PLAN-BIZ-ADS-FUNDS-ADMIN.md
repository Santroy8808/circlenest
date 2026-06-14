# Codex Implementation Plan: Biz Profiles, Ads, Funds, Admin Console, and Tier Corrections

## Purpose

This document reformats the implementation plan into a clean execution guide for Codex work in `C:\Repos\thetansplace\circlenest-dev`.

## Operating Rules

- Use the existing Codex workspace for `Santroy8808/circlenest`.
- Do not clone the repository.
- Do not hard-code credentials.
- Do not write real payment credentials, processor secrets, tax IDs, bank data, or private user data into source code, tests, logs, screenshots, fixtures, or markdown.
- Do not implement real money movement with mock assumptions. Build safe abstractions first.
- Do not allow admins to manually add real cash to any account.
- Admins may grant platform-only credits, such as ad credits or event-promotion credits. These credits are never cash, never withdrawable, and never convertible into real money.
- All real money additions must originate from payment processors.
- All real money withdrawals must go through processor-backed withdrawal requests, batch processing, and audit trails.

## Product Rules To Preserve

### Free Tier

- Free users must be able to browse job listings.
- Free users must see `Find a Job` under Production Zone.
- Free users must not be able to create job listings.
- Free users must not be able to create marketplace listings.
- Free users may browse marketplace listings if the product intends marketplace browsing to be public or member-visible.

### Contributor Tier

- Contributor users must be able to create marketplace listings.
- Contributor marketplace posting limit is `6 marketplace listings per rolling 2-week period`.
- The existing weekly helper may remain if useful, but the user-facing rule should be `6 over 2 weeks`.
- Contributor listing image limit should remain limited.
- Contributor listing lifetime should remain time-bounded unless the product owner changes it.
- Contributor users must not be able to create job listings.
- Contributor users must be able to browse job listings.

### Biz Tier

- Biz users can create job listings.
- Biz users can create unlimited marketplace listings.
- Biz users can create ads.
- Biz users can create and manage a Company Profile / Business Profile.
- Biz users can access storefront tools, ad creation and management, job postings, campaign tools, and business account tools after Company Profile setup is complete.

## Phase 1: Navigation and Tier Permission Cleanup

### Goal

Make tier navigation obvious and correct before deeper business and payment work begins.

### Tasks

- Confirm Production Zone always shows these browse-oriented cards:
  - `Events`
  - `Market`
  - `Find a Job`
  - `Find an Auditor`
- Confirm Free users can open the job board and browse job listings.
- Confirm Free users cannot access job creation routes.
- Confirm Contributor users can browse job listings but cannot create job listings.
- Confirm Biz users can browse and create job listings.
- Update all user-facing copy so the difference is explicit:
  - `Free and Contributor members can browse jobs.`
  - `Only Biz members can post jobs.`
  - `Contributor members can post 6 marketplace listings every 2 weeks.`
  - `Biz members can post unlimited marketplace listings.`
- Add route-level guards, not just UI hiding.
- Add tests for each tier:
  - Free can browse jobs.
  - Free cannot create jobs.
  - Contributor can browse jobs.
  - Contributor cannot create jobs.
  - Contributor can create marketplace listing until limit.
  - Contributor is blocked after 6 listings in 2 weeks.
  - Biz can create jobs.
  - Biz can create unlimited marketplace listings.

### Acceptance Criteria

- Free tier sees `Find a Job` directly under Production Zone.
- Free tier can browse jobs without an upgrade wall.
- Job creation requires Biz.
- Contributor marketplace limit is enforced at the API level.
- Biz marketplace creation does not use Contributor limits.
- Copy matches the actual policy.

## Phase 1.5: Communications Split Blueprint

### Goal

Split fast conversation from formal internal correspondence before deeper business, admin, and support flows are expanded.

### Core Product Decision

- `Chat` is for real-time or near-real-time conversation.
- `Inbox` or `Mail` is for internal mail-style communication.
- Do not treat both systems as the same feature with different labels.

### Why This Happens Here

- Navigation and mental model should be corrected before Biz workflows, support tooling, admin notices, and inquiry systems are built on top of the wrong communications structure.
- Invites, alerts, receipts, moderation replies, and business inquiries should not be forced through the same UX as casual conversation.

### User-Facing Model

#### Chat

Use Chat for:

- direct member-to-member conversation
- group chat conversation
- quick back-and-forth replies
- active coordination around groups, events, or business activity

Expected Chat UX:

- conversation list
- search
- unread indicators
- single chat and group chat distinction
- real-time or polling-based updates
- lightweight composer
- attachment support where already allowed by product rules

#### Inbox / Mail

Use Inbox or Mail for:

- group invites
- event invites
- admin notices
- support replies
- platform announcements addressed to the member
- business inquiries
- formal member-to-member messages
- receipts, invoices, subscription notices, and account-related correspondence

Expected Inbox UX:

- mailbox-style thread list
- subject lines
- sender and recipient display
- unread, archived, and important states
- attachment-friendly layout
- slower, more formal composition flow
- rich text formatting
- inline image support and uploaded image attachments

### Desktop Mail Surface

- Opening `Mail` from the control panel should not force a full page takeover by default.
- On desktop, Mail should open in a movable, resizable floating window similar to the current live chat pop-out behavior.
- The member should be able to keep browsing the rest of Theta-Space while the Mail window remains open.
- The Mail window should support:
  - drag to move
  - resize from edges or corners
  - collapse or minimize behavior if the existing chat pattern supports it
  - persistent thread state while browsing

### Mail Window Layout

- The Mail window should feel closer to a compact Gmail-style work surface than a chat transcript.
- Keep it streamlined and lighter than full Gmail.
- Avoid oversized settings panels or heavy enterprise clutter.

Recommended compact three-region structure:

- left drawer
- center thread list
- right reading or composer pane

If the viewport is smaller, collapse progressively:

- left drawer collapses first
- thread list becomes the primary view
- reading or composer view opens as the active pane

### Left Drawer Requirements

The left side should use a clickable pop-out drawer.

The drawer should contain:

- searchable contacts
- scrollable contacts list inside its own card
- inbox folder list
- sent folder
- archive folder
- draft folder if drafting is supported
- system folders or labels for platform-generated mail if needed

Important behavior:

- The contacts section and folder section should be easy to scan and not visually noisy.
- The drawer should open and close without disrupting the current mail thread.
- Search should filter contacts quickly inside the drawer.

### Navigation Rules

- `Communications` should become a category, not a single destination.
- Under `Communications`, expose:
  - `Chat`
  - `Inbox` or `Mail`
  - `Notifications`
  - `Alerts`
- Remove ambiguity where current `Messages` appears to mean both chat and mail.
- If transitional UI is needed, use explicit labels such as:
  - `Chat`
  - `Inbox`

### Routing Rules

#### Send To Chat

- user-started conversations
- direct replies between members
- group chat discussion
- live event or business coordination

#### Send To Inbox

- invites to groups or events
- admin decisions or moderator outcomes
- petitions and support-case replies
- subscription confirmations, invoices, and receipts
- business contact submissions
- formal outreach that should remain threaded and reviewable

#### Send To Notifications

- mention alerts
- reaction alerts
- comment or reply activity
- lightweight activity pings

#### Send To Alerts

- urgent account or moderation issues
- reports involving the user
- required policy acceptance
- security notices
- elevated platform announcements

### Data Boundary Rules

- Chat and Inbox must be modeled as separate domains, even if they temporarily share some supporting utilities.
- Do not keep bolting mail behavior onto the chat thread model.
- Do not overload inbox-style records to simulate real-time chat.
- Shared concerns such as attachments, read-state helpers, and participant lookups may reuse service layers where safe.

### Recommended Backend Direction

#### Chat Domain

Should support:

- participants
- group vs direct chat type
- per-message read state or last-read markers
- live polling or socket-friendly expansion later
- lightweight attachments

#### Inbox Domain

Should support:

- thread subject
- sender
- recipients
- message body
- archive state
- important state
- system message type
- related entity references, such as:
  - `groupId`
  - `eventId`
  - `businessProfileId`
  - `subscriptionId`
  - `reportId`
  - `supportCaseId`

### Business and Admin Dependencies

This split should happen before or alongside:

- Biz inquiry handling
- support workflows
- admin notices
- moderation outcomes
- invite acceptance flows
- subscription receipt delivery

These systems should target Inbox, not Chat.

### Migration Rules

- Existing casual direct-message threads should remain in Chat.
- Existing system-like threads that behave as notices or invitations should be reviewed for migration into Inbox where feasible.
- Avoid destructive migration if current data is messy; prefer controlled remapping logic.
- Transitional labels are acceptable during rollout, but the end state must remove the old overloaded `Messages` concept.

### UI Blueprint

#### Chat

- left-side or top conversation list depending on screen size
- searchable threads
- quick compose or friend picker
- clear group vs direct indicators
- active conversation pane or pop-out chat surface

#### Inbox

- thread list with subject, sender, preview, and timestamp
- open thread view with full message history
- archive and mark-unread actions
- clear action buttons for invite acceptance, support response, or account-related follow-up where relevant
- compact left drawer for contacts and folders
- reading pane that feels like mail, not chat
- composer that supports rich text and image upload

### Composer Requirements

- Mail compose should support rich text formatting.
- Members should be able to upload pictures into a mail message.
- The composer should support:
  - subject field
  - recipients
  - formatted body
  - embedded or attached images
  - send
  - save draft if drafts are implemented in the current phase

Formatting should be intentionally limited and clean:

- bold
- italic
- underline if supported
- lists
- links
- image insertion

Do not turn the composer into an overbuilt document editor.

### Mobile Rules

- Chat should remain optimized for fast thumb-driven navigation.
- Inbox should read like a compact mailbox, not a squeezed chat transcript.
- Do not stack too many control boxes above the primary content.
- Keep navigation between Chat and Inbox explicit in the slide-out menu.
- On mobile, Mail may open as its own full-page destination instead of a floating window.
- Mobile Mail should still preserve the same mental model:
  - folder access
  - contacts access
  - thread list
  - message reading
  - rich text compose in a compact form

### Acceptance Criteria

- `Messages` no longer serves as an overloaded label for both chat and mail.
- Members can immediately tell the difference between Chat and Inbox.
- Invites, admin notices, receipts, and support replies route to Inbox.
- Casual conversation routes to Chat.
- Notifications and Alerts remain separate from Chat and Inbox.
- Navigation copy, route structure, and feature gating all reflect the split.
- Desktop Mail opens as a movable, resizable pop-out surface that allows continued site browsing.
- Mail includes a left drawer for contacts and folders.
- Mail composition supports rich text and image upload.

## Phase 2: Company Profile / Business Profile Upgrade

### Goal

Create a professional Company Profile system that becomes part of the Biz upgrade process and unlocks Biz production tools.

### Core Rule

- The Company Profile is a sub-profile of the main user account.
- It must not replace the personal member account.

### Design Decision

- Keep Company Profile data in the same Postgres database for now, using separate tables with strict access rules.
- Do not create a second database yet unless there is a clear operational requirement.
- Separate tables, encrypted sensitive columns, and clear access boundaries are enough for the current stage.
- If payment processor compliance later requires isolation, the schema can move to a separate service or database.

### Data Model Changes

- Expand `BusinessProfile` or add linked models.

#### Recommended `BusinessProfile`

Core public and operational fields:

- `id`
- `ownerId`
- `businessName`
- `legalBusinessName`
- `dbaName`
- `entityType`
- `industry`
- `category`
- `tagline`
- `description`
- `websiteUrl`
- `supportEmail`
- `publicContactEmail`
- `publicContactPhone`
- `businessPhone`
- `country`
- `state`
- `city`
- `postalCode`
- `streetAddress1`
- `streetAddress2`
- `timezone`
- `logoUrl`
- `bannerUrl`
- `isPublic`
- `status`
- `verificationStatus`
- `storefrontSlug`
- `storefrontEnabled`
- `createdAt`
- `updatedAt`

#### Recommended `BusinessComplianceProfile`

Sensitive and payment-prep fields:

- `id`
- `businessProfileId`
- `taxCountry`
- `taxIdLast4`
- `taxIdEncrypted`
- `einLast4`
- `einEncrypted`
- `ownerLegalName`
- `ownerDobEncrypted`
- `processorAccountId`
- `processorProvider`
- `processorOnboardingStatus`
- `processorRequirementsJson`
- `processorChargesEnabled`
- `processorPayoutsEnabled`
- `termsAcceptedAt`
- `verifiedAt`
- `rejectedAt`
- `rejectionReason`
- `createdAt`
- `updatedAt`

Important handling rule:

- EIN and tax data must not be stored casually.
- Store only what is required.
- Prefer processor-hosted onboarding.
- Keep only masked and encrypted values contributor processor account IDs.

#### Recommended `BusinessProfileAuditLog`

- `id`
- `businessProfileId`
- `actorUserId`
- `action`
- `previousStatus`
- `nextStatus`
- `note`
- `metadataJson`
- `createdAt`

### UX Requirements

- Create a guided Biz onboarding flow:
  - Choose Biz upgrade.
  - Confirm plan.
  - Create Company Profile.
  - Provide legal and payment processor onboarding information.
  - Connect or initialize payment processor account.
  - Review and submit.
  - Unlock Biz Production Zone tools.
- The Company Profile setup should be powerful but easy.
- Use a multi-step wizard:
  - `Public Identity`
  - `Contact & Location`
  - `Legal Business Info`
  - `Payment Processor Setup`
  - `Storefront Setup`
  - `Review & Activate`

### Unlocking Rules

- Biz account exists separately from Company Profile completion.
- Company Profile completion should unlock:
  - Job postings
  - Storefront
  - Ads creation and management
  - Business dashboard
  - Campaign funding tools
  - Event promotion tools
  - Marketplace seller tools
- If the user has Biz but no completed Company Profile, show a setup checklist instead of dead links.

### Acceptance Criteria

- Biz users have one primary Company Profile linked to their user account.
- Biz Production Zone shows Company Profile setup status.
- Incomplete Company Profile blocks Biz business tools with a clear checklist.
- Completed Company Profile unlocks storefront, job posting, ads, and business management.
- Legal, tax, and payment data is not exposed in normal profile views.
- Sensitive fields are encrypted or delegated to the payment processor.

## Phase 3: Storefront and Business Dashboard

### Goal

Make the business area feel like a real operational hub, not just a few links.

### Business Dashboard Sections

Add a `Production Zone > My Business` dashboard with:

- Company Profile status
- Storefront status
- Job listings
- Marketplace listings
- Active ads
- Draft ads
- Campaign spend
- Platform credit balance
- Real account balance summary
- Pending withdrawal requests
- Payment processor status
- Recent business activity
- Admin notices or holds

### Storefront Requirements

The storefront should display:

- Business name
- Logo and banner
- Tagline
- Description
- Contact method
- Location and service area
- Marketplace listings
- Job listings
- Events
- Fundraisers, if applicable
- Featured articles or posts
- Inquiry form

### Acceptance Criteria

- Biz users can manage all business tools from one place.
- Storefront cannot be enabled until Company Profile requirements are complete.
- Public storefront never exposes legal, tax, payment, or private owner data.

## Phase 4: Ads System Expansion

### Goal

Convert ads from simple placements into campaigns with images, article landing pages, budget, duration, ranking, and analytics.

### Current Concept

- Ads are currently image-based.
- A user sees an image in the ad stream.
- Clicking the image opens a full article, post, listing, event, job, fundraiser, or landing page.

### Required Ad Flow

Create an ad campaign wizard:

- Select campaign target:
  - Marketplace listing
  - Job listing
  - Event
  - Fundraiser
  - Storefront
  - Custom article or sponsored post
- Upload ad image.
- Create or attach landing content:
  - Full article title
  - Body content
  - Images or media
  - Call-to-action button
  - Destination URL or internal target
- Set campaign budget.
- Set campaign duration.
- Choose targeting settings where allowed:
  - Location
  - Interests or topics
  - Broad demographic targeting from non-confidential profile data
- Preview ad.
- Submit campaign.
- Start, pause, edit, stop, or archive campaign.

### Models

Add or expand these models:

#### `AdCampaign`

- `id`
- `creatorId`
- `businessProfileId`
- `title`
- `status`
- `budgetAmountCents`
- `currency`
- `platformCreditBudget`
- `startsAt`
- `endsAt`
- `dailyBudgetCents`
- `targetType`
- `targetId`
- `landingArticleId`
- `imageUrl`
- `boostFactor`
- `manualAdminBoost`
- `manualAdminDemotion`
- `createdAt`
- `updatedAt`

#### `AdArticle`

- `id`
- `campaignId`
- `title`
- `body`
- `heroImageUrl`
- `mediaJson`
- `ctaLabel`
- `ctaUrl`
- `status`
- `createdAt`
- `updatedAt`

#### `AdImpression`

- `id`
- `campaignId`
- `viewerId` nullable
- `anonymousSessionId` nullable
- `placementSlot`
- `appearedAt`
- `viewStartedAt`
- `viewEndedAt`
- `viewDurationMs`
- `viewportJson`
- `profileSnapshotJson`
- `createdAt`

#### `AdClick`

- `id`
- `campaignId`
- `viewerId` nullable
- `anonymousSessionId` nullable
- `clickedAt`
- `clickTarget`
- `profileSnapshotJson`

#### `AdEngagement`

- `id`
- `campaignId`
- `viewerId` nullable
- `eventType`
- `metadataJson`
- `createdAt`

#### `DailyAdRankingSnapshot`

- `id`
- `campaignId`
- `dateKey`
- `spendWeight`
- `engagementWeight`
- `recencyWeight`
- `boostWeight`
- `fairnessWeight`
- `finalRankScore`
- `impressionsAllocated`
- `createdAt`

### Privacy Requirements

- Ad analytics may use non-confidential profile-derived data only.
- Allowed examples:
  - approximate location
  - country, state, or city if profile visibility allows
  - general interests or topics
  - age bracket if explicitly collected and allowed
  - gender only if explicitly provided and allowed
- Do not expose direct confidential profile data to advertisers.
- Do not give advertisers user-level identities unless the user directly interacts in a way that already reveals identity, such as sending an inquiry.
- Report analytics in aggregate by default.

### Backend Auction and Ranking System

- There is already math for auction fairness that has not been tested.
- Codex should locate the existing auction math and integrate it with the new campaign system.

Expected behavior:

- A daily job crunches all active ad campaigns.
- The system recalculates placement rank based on budget, duration, remaining spend, engagement, freshness, manual boosts and demotions, and fairness.
- Ads with higher fair rank appear higher or more often in the ad stream.
- Ads lose rank over time as impressions are served and budget and duration progress.
- The system prevents one business from permanently dominating the stream.
- Ranking snapshots are stored for auditing and debugging.

### Admin Controls For Ads

Admins can:

- Pause ads.
- Remove ads.
- Approve or reject ads if a moderation queue is enabled.
- Manually boost an ad.
- Manually demote an ad.
- Add platform-only ad credits.
- View campaign analytics.
- View ranking history.
- View spend history.
- See why an ad is ranking where it is.

Admins cannot:

- Add real cash.
- Change real payment ledger balances.
- Withdraw funds manually.
- Convert platform credits to cash.

### Acceptance Criteria

- Biz can create full ad campaigns with image contributor article.
- Campaigns have budget and duration.
- Campaigns can start, pause, stop, edit, and archive.
- Daily ranking job produces deterministic ranking snapshots.
- Ad stream uses campaign ranking.
- Analytics track impressions, clicks, view duration, and aggregate viewer profile data safely.
- Admins can boost, demote, and remove ads with audit logging.
- Platform credits are separate from real money.

## Phase 5: Funds, Wallet, Ledger, and Withdrawals

### Goal

Create a safe internal funds system without giving admins dangerous manual money powers.

### Ledger Principles

- Use append-only ledgers.
- Never mutate balances directly.
- Balances are derived from ledger entries.
- Admins cannot create real-money ledger credits.
- Only payment processors can create real-money deposit entries.
- Withdrawals must be requested, reviewed, batched, and processed through the payment processor.

### Required Ledgers

Create separate ledgers for:

- Real money ledger
- Platform credit ledger
- Test or funny money ledger

These ledgers must never mix.

### Real Money Ledger

Represents real funds from payment processors.

Entry types:

- `PROCESSOR_DEPOSIT`
- `MARKETPLACE_PAYMENT`
- `EVENT_PAYMENT`
- `FUNDRAISER_DONATION`
- `PLATFORM_FEE`
- `SELLER_CREDIT`
- `WITHDRAWAL_REQUEST`
- `WITHDRAWAL_SENT_TO_PROCESSOR`
- `WITHDRAWAL_FAILED`
- `WITHDRAWAL_COMPLETED`
- `REFUND`
- `CHARGEBACK`
- `ADJUSTMENT_FROM_PROCESSOR`

Rules:

- Admin-created credit entries must not exist in the real ledger.

### Platform Credit Ledger

Used for internal Theta-Space credits only.

Examples:

- Free ad credits
- Event-promotion credits
- Campaign credits
- Monthly Biz ad credits
- Manual promotional credits

Rules:

- These credits are never withdrawable.
- These credits never become cash.

### Test / Funny Money Ledger

Used only for testing.

Requirements:

- Must be behind an environment flag.
- Must never run in production unless explicitly configured for sandbox mode.
- Must visually label balances as test money.
- Must not connect to real payment processors.
- Must not affect real marketplace, fundraiser, event, or withdrawal flows.

### Withdrawal Batching

Implement scheduled withdrawals to reduce processor calls and costs.

Initial schedule:

- Tuesday
- Thursday
- Saturday

Flow:

- User requests withdrawal.
- System checks available balance.
- System creates withdrawal request entry.
- Request enters queue.
- Batch job runs on scheduled days.
- Processor processes payouts.
- Ledger records processor response.
- User sees status.

Statuses:

- `PENDING`
- `APPROVED`
- `QUEUED_FOR_BATCH`
- `SENT_TO_PROCESSOR`
- `COMPLETED`
- `FAILED`
- `CANCELED`
- `HOLD`

### Admin Financial Permissions

Admins can:

- View ledger entries.
- View derived balances.
- View withdrawal queue.
- Put a withdrawal on hold.
- Release a hold.
- Mark a case for review.
- Add notes.
- Export reports.
- Reconcile processor responses.
- Grant platform-only credits.

Admins cannot:

- Add real cash.
- Delete ledger entries.
- Modify ledger entries.
- Manually complete withdrawals without processor confirmation.
- Withdraw on behalf of a user outside the controlled withdrawal process.

### Acceptance Criteria

- Real money ledger is append-only.
- Platform credits are separate and non-withdrawable.
- Test ledger is isolated.
- Withdrawal batching exists.
- Admin cannot add real cash.
- Payment processor events are the only source of real-money deposits.

## Phase 6: Payment Processor Configuration

### Goal

Allow admins to configure payment processors for events, fundraisers, marketplace listings, business accounts, and withdrawals.

### Processor Areas

Support configuration for:

- Membership subscriptions
- Marketplace payments
- Fundraiser donations
- Event payments
- Business onboarding
- Withdrawals and payouts
- Platform fees

### Admin Processor Console

Admins should be able to:

- View configured processors.
- Configure public keys and non-secret metadata.
- Verify secret configuration exists without exposing it.
- Set processor mode: sandbox or production.
- Set enabled payment flows.
- Set platform fee percentages.
- Set withdrawal batch schedule.
- View webhook health.
- View processor account status.
- Retry failed webhook processing.

Rules:

- Do not show secret keys in the admin UI.
- Use environment variables or a secrets manager for actual secrets.

### Acceptance Criteria

- Processor configuration is visible but secrets are never exposed.
- Webhook health is visible.
- Sandbox and production modes are clearly separated.
- Processor config changes are audit logged.

## Phase 7: True Admin Console

### Goal

Build a real admin console with guided, step-based workflows for sensitive operations.

### Design Rule

- The admin console should not be a pile of buttons.

### Admin Console Sections

#### 1. Accounts

Admins can:

- Search users.
- View user summary.
- Suspend account.
- Restore account.
- Trigger password reset email.
- Reset 2FA after verification.
- Revoke sessions.
- View account security events.
- View subscription tier.
- Change subscription tier only where policy allows.
- View business profile status.
- View payment processor onboarding status.
- View ledger summary.

Admins cannot:

- Delete users.
- View raw passwords.
- View raw 2FA secrets.
- Add real cash.

#### 2. Content Moderation

Admins can:

- Remove posts.
- Restore posts.
- Lock comments.
- Unlock comments.
- Remove comments.
- View reports.
- Assign reports.
- Resolve reports.
- Suspend repeat offenders.
- View moderation history.

#### 3. Business Profiles

Admins can:

- Review business profile submissions.
- Approve business profile.
- Reject business profile.
- Request changes.
- View processor onboarding status.
- View public storefront.
- Disable storefront.
- Add internal notes.
- View audit log.

Admins cannot:

- Edit sensitive legal and tax data directly except through controlled correction workflows.
- Bypass payment processor verification for real payouts.

#### 4. Ads

Admins can:

- View campaigns.
- Pause campaigns.
- Remove campaigns.
- Approve or reject campaigns.
- Manually boost campaigns.
- Manually demote campaigns.
- Grant platform-only ad credits.
- View analytics.
- View ranking snapshots.
- View spend history.

Admins cannot:

- Add real ad cash balance.
- Convert ad credits to money.
- Delete ad analytics records.

#### 5. Money / Ledger

Admins can:

- View real ledger.
- View platform credit ledger.
- View test ledger.
- View withdrawal queue.
- Put withdrawals on hold.
- Release holds.
- Export reports.
- Reconcile processor responses.
- View failed payout cases.

Admins cannot:

- Add real money.
- Delete ledger entries.
- Modify ledger entries.
- Withdraw money manually.

#### 6. Payment Processors

Admins can:

- View provider configuration.
- Verify webhook status.
- Retry webhook events.
- Set flow availability.
- Set platform fees.
- Set withdrawal batch schedule.

Admins cannot:

- View raw secrets.
- Store secrets in the database unless encrypted and explicitly designed.

#### 7. Platform Configuration

Admins can:

- Configure tier limits.
- Configure ad credit grants.
- Configure ad auction weights.
- Configure announcement banners.
- Configure terms version.
- Configure feature flags.
- Configure marketplace categories.
- Configure job categories.
- Configure event categories.

Rules:

- All changes must be audit logged.

### Guided Admin Workflows

Sensitive actions should be multi-step.

Example: `2FA Reset`

- Search account.
- Confirm user identity verification steps.
- Show risk warning.
- Require admin password or privileged action confirmation.
- Reset 2FA.
- Send notification email.
- Log action.

Example: `Account Suspension`

- Search account.
- Select reason.
- Review recent reports.
- Confirm scope.
- Suspend account.
- Notify user if appropriate.
- Log action.

Example: `Withdrawal Hold`

- Open withdrawal.
- Review ledger history.
- Select hold reason.
- Add note.
- Confirm.
- Notify user if appropriate.
- Log action.

### Acceptance Criteria

- Admin console has separate sections.
- Sensitive operations are guided.
- Sensitive operations require fresh admin or secure-area confirmation.
- All admin operations are audit logged.
- Admin cannot delete records that should be preserved.
- Admin cannot add real money.

## Phase 8: Testing

### Required Test Coverage

Add tests for:

#### Tier Access

- Free can browse jobs.
- Free cannot post jobs.
- Contributor can browse jobs.
- Contributor cannot post jobs.
- Biz can post jobs.
- Contributor market listing limit is 6 over 2 weeks.
- Biz marketplace posting is unlimited.

#### Business Profile

- Biz can create Company Profile.
- Free cannot create Company Profile.
- Contributor cannot create Company Profile.
- Company Profile completion unlocks Biz tools.
- Incomplete Company Profile blocks Biz tools with clear UI.

#### Ads

- Biz can create ad campaign.
- Free and Contributor cannot create ad campaign.
- Ad campaign requires image and landing article or target.
- Campaign duration and budget are required.
- Impression and click events are recorded.
- Ad analytics aggregate profile data safely.
- Admin boost and demote changes ranking.
- Platform credits cannot be withdrawn.

#### Money

- Real ledger only accepts processor-originated deposits.
- Admin cannot create real-money credit.
- Admin can create platform-only credits.
- Funny money ledger works only in test or sandbox mode.
- Withdrawal batching processes Tuesday, Thursday, and Saturday.
- Failed withdrawal records failure without deleting history.

#### Admin

- Admin can suspend and restore account.
- Admin can trigger password reset email.
- Admin can reset 2FA with guided flow.
- Admin can pause and remove ads.
- Admin can view ledgers.
- Admin cannot delete ledger entries.
- Admin cannot add real money.
- Every sensitive admin action is audit logged.

### Validation Commands

Run:

```bash
npm run lint
npx tsc --noEmit
npm run build
npx prisma validate --schema prisma/schema.postgres.prisma
```

- Add or update Playwright tests for tier browsing and critical flows.

## Implementation Order

1. Fix tier navigation and job browsing.
2. Expand Company Profile schema and UI.
3. Add Biz onboarding checklist.
4. Gate Biz tools behind completed Company Profile.
5. Expand ads into campaigns and landing articles.
6. Add ad analytics models.
7. Integrate daily ad ranking and auction job.
8. Add real, platform, and test ledgers.
9. Add withdrawal batching.
10. Expand Admin Console into guided workflows.
11. Add payment processor configuration UI.
12. Add tests and acceptance validation.

## Non-Negotiables

- Free can browse jobs.
- Only Biz can post jobs.
- Contributor can create 6 marketplace listings every 2 weeks.
- Biz marketplace posting is unlimited.
- Company Profile is required for serious Biz tools.
- Company Profile is a sub-profile of the main user account.
- Admins cannot add real money.
- Admins can grant platform-only credits.
- Real money only enters through payment processors.
- Withdrawals happen through controlled processor-backed batches.
- Fake money must be isolated from real accounts.
- All sensitive admin actions must be guided and audit logged.

## Additional Admin Powers

Admins should also have:

- Session revocation: force-log-out a compromised user.
- Email verification resend: help users stuck during signup.
- Login and security event viewer: failed logins, password resets, 2FA events, suspicious activity.
- Terms and version enforcement: force users to accept updated terms.
- Feature flag control: enable or disable risky new modules.
- Category management: marketplace categories, job categories, event categories, fundraiser categories.
- Abuse and rate-limit controls: throttle spammy users or businesses.
- Business verification workflow: approve, reject, request changes, place on hold.
- Webhook replay console: retry failed payment and webhook events safely.
- Read-only financial exports: CSV and reporting without edit power.
- Public announcement system: global, tier-specific, or targeted notices.
- Data export request workflow: track export and deletion requests without hard-deleting operational ledgers.
- Support case notes: internal notes attached to users, businesses, and campaigns.
- `View as role` preview: inspect what Free, Contributor, Biz, and Admin users would see without impersonating or taking action as that user.

## Core Boundary

Admins can control platform privileges, safety, moderation, credits, and review workflows, but they must not invent real money.
