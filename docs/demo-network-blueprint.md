# Demo Network Blueprint

This blueprint defines the staged demo world used by `scripts/seed-demo-network.ts`.

## Purpose

Create a realistic three-month Theta-Space sandbox with enough people, activity, and business behavior to test the app as a living private social network instead of a set of empty feature pages.

## Cohorts

- `100` Free members: everyday members who browse, post, comment, join groups, view jobs, view Market listings, use chat, use mail, and react to content.
- `25` Contributor members: higher-storage members who write, participate more heavily, make limited Market listings, moderate some groups, and organize discussion.
- `10` Auditor members: Auditor-tier members with Find an Auditor listings, service descriptions, contact data, travel preferences, and a few ads pointing to their auditor profiles.
- `5` Business members: Professional-tier business accounts with storefronts, listings, ads, job posts, internal mass mail campaigns, and 100 starting platform credits each.

All seeded accounts use the password `Pa$$werd13` and are preverified. Demo accounts use `@demo.theta-space.dev`.

## Staged Model

### Stage 1: Identity

- Create users, profiles, memberships, My Scientology fields, mail preferences, and login history.
- Profiles include realistic names, locations, taglines, avatars, and banners.
- Business accounts are Professional tier and receive 100 platform credits.
- Auditor accounts are Auditor tier and receive public auditor directory listings.

### Stage 2: Social Graph

- Members receive friend, family, contact, and follow relationships.
- Contacts are separate from friends and are created through mail, business inquiries, and commerce interactions.
- Blocks/mutes are not heavily seeded because they would hide content during visual QC.

### Stage 3: Media

- Every seeded member gets a small My Pics pool.
- Photos use deterministic placeholder URLs and R2-shaped storage keys.
- Albums/tags/date collections are seeded enough to test gallery filtering without overloading the page.

### Stage 4: Main Stream

- Posts are spread over the past 90 days.
- Posts include comments, nested replies, reactions, and some attached images.
- The stream should look active but not spammy.

### Stage 5: Groups And Forums

- Public and private groups are created with avatars, banners, taglines, owners, moderators, and members.
- Free-created groups stay small; Contributor and Professional-created groups are larger.
- Threads are collapsed-by-default candidates, include replies and reactions, and some are ended.
- Group gallery/docs are seeded with simple assets and comments.

### Stage 6: Events

- Business/Professional accounts create a small set of events.
- Events include invitations, RSVPs, moderators, and related notifications.
- Ads promote events through normal ad campaigns, not embedded event-listing ads.

### Stage 7: Market And Jobs

- Contributor accounts get limited active Market listings.
- Business/Professional accounts get more Market listings and job listings.
- Listings are photo-first thumbnail candidates with titles, prices, and detail content.
- Job posts are Professional-only creation but visible to all tiers.

### Stage 8: Auditor Directory

- Auditor-tier accounts receive active Find an Auditor listings.
- Listings include practice name, location, travel preference, bio, offerings, phone, and website.
- Auditor accounts receive starter discovery ad credits.

### Stage 9: Storefronts And Ads

- Each business has a storefront with logo, banner, gallery, public contact info, and published articles.
- Ads target storefronts, Market listings, and business articles.
- Auditor ads point to auditor profile pages and are tracked through the same delivery logs as business ads.
- Ad logs include impressions and clicks so the right ad stream can show believable activity.
- Business accounts keep 100 platform credits and receive matching ledger grants.

### Stage 10: Mail And Chat

- Mail is seeded as formal internal email: direct mail, mass internal mail, and storefront inquiries.
- Chat is seeded separately as quick direct/group chat.
- Mass mail has recipient caps and opt-out examples.

### Stage 11: Fundraisers, Writers, Notifications, Alerts, Feedback

- Business/Professional accounts create fundraisers with pledged/confirmed contributions.
- Contributor accounts create manuscripts and chapters.
- Members receive notifications and alerts across events, groups, mail, ads, and reports.
- Feedback tickets create realistic support/testing traffic.

## Realistic Activity Pattern

- Most members have 4 to 8 relationships.
- A smaller power-user group creates more posts, comments, and group threads.
- Businesses create steady ads and mass mail, but ads stay in reserved placements.
- Auditors receive discovery traffic through directory listings, profile ads, mail contacts, and group participation.
- Contributors participate in writing, Market listings, and group moderation.
- Free members browse jobs and Market listings, comment on posts, attend events, and contact businesses.

## Seed Safety

The seed script is intentionally idempotent:

- It deletes previous demo users with `@demo.theta-space.dev`.
- It deletes top-level demo records with `demo-` slugs and `[Demo]` subjects.
- It leaves normal manually-created accounts alone.

## Run Command

```powershell
$line = Get-Content .env.local | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$env:DATABASE_URL = ($line -replace '^DATABASE_URL=', '').Trim('"')
npm.cmd run db:seed:demo-network
```

## Acceptance Checks

- 100 Free demo users exist.
- 25 Contributor demo users exist.
- 10 Auditor demo users and auditor listings exist.
- 5 Professional business demo users exist.
- Business accounts have 100 platform credits.
- People, Home, Groups, Market, Jobs, Auditors, Mail, Chat, Business Center, Ads, Fundraisers, and Writers have visible demo data.
- Rerunning the seed does not duplicate demo users or demo slugs.
