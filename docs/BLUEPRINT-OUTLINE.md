# Theta-Space Blueprint Outline

Last updated: 2026-06-10

## 1. Current Product Shape

Theta-Space is a private, invitation-based, multi-tier paid social media platform for Scientologists. It is intended as a Facebook-style replacement where invited members can interact with friends, family, groups, events, listings, and community-specific discovery tools inside a controlled membership environment.

The current app is built as a modular monolith. It centers on member profiles, social stream activity, private messaging, groups, events, galleries, secure account areas, and early production-zone tools for marketplace, hiring, and auditor discovery.

Primary current surfaces:

- Home and feed stream
- Member profiles, resume, gallery, and Scientology profile pages
- Friends, follows, blocking, and people search
- Direct messages and message threads
- Groups with membership, join requests, roles, forum, photos, documents, and group events
- Standalone events with invitations and scoped moderators
- Notifications and alerts
- Bazaar marketplace listings
- Jobs board
- Find an Auditor directory
- Production Zone policy-gated areas
- Admin page and moderation support
- Settings, theme controls, stream rules, notification dings, and mobile navigation settings
- Secure-area unlock flow for sensitive account sections

## 2. Membership And Tier Model

Theta-Space is intended to support private invited membership with tiered access.

### Tier 1: Free

Purpose:

- Entry-level membership for invited Scientologists.
- Limited access and limited storage.
- Can participate socially, but cannot hold broader trust roles.

Expected access:

- Message other members.
- Comment and reply.
- Post to permitted areas.
- Create a group with a maximum of 10 people.
- Join and participate in groups.
- View the hiring board.
- Use Find an Auditor.
- View Bazaar listings.

Expected limits:

- Cannot change feed type.
- Cannot create Bazaar listings.
- Cannot create ads.
- Cannot be a moderator for the whole site.
- Cannot be assigned moderator privileges by another member.
- Can create a group and is the first moderator of that group by ownership, but cannot assign the moderator role to other group members while on the Free tier.
- Other basic customization and power-user settings may be restricted.

### Tier 2: Contributor

Purpose:

- Expanded membership for trusted active users who need creation tools, larger groups, and listing access.

Expected access:

- Includes Free-tier access.
- Create Bazaar listings.
- Create hiring board posts.
- Create events.
- Create ads for Bazaar listings.
- Create ads for event listings.
- Increased storage allowance, amount still undefined.
- Create groups with unlimited size.
- Assign other members of created groups as moderators.
- Can be invited to moderate the whole site.
- After 6 months, may invite other qualified people.

Expected limits:

- No admin access.
- Cannot create ads for a business unless a later tier or business-specific feature allows it.

### Tier 3: Pro

Purpose:

- Full-feature membership for members who need the broadest platform capabilities without admin control.

Expected access:

- Includes Contributor-tier access.
- Full access to all non-admin features.
- Can be a moderator.
- After 6 months, may invite other qualified people.
- Starts each month with a defined number of ad credits.

Expected limits:

- No admin access.

### Admin

Admin is separate from paid membership tier.

- Admin access is controlled by `User.role === "ADMIN"` and bootstrap admin emails.
- Paid tier does not grant admin access.
- Admins retain full platform access and bypass scoped moderation checks.

## 3. Technical Foundation

Runtime and framework:

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- Prisma ORM
- NextAuth/Auth.js beta
- Zod validation
- Nodemailer email support
- Sharp image processing
- S3-compatible storage support through AWS SDK

Repository shape:

- Dev repo: `C:\Repos\thetansplace\circlenest-dev`
- Production repo: `C:\Repos\thetansplace\circlenest`
- Production deploy source: production repo `main`
- Railway is linked to production `main`

Database profiles:

- Local/default schema: `prisma/schema.prisma` using SQLite
- Production/Postgres schema: `prisma/schema.postgres.prisma`
- Prisma client generation targets the Postgres schema in `postinstall`

Delivery rule:

1. Edit in dev.
2. Backup production.
3. Push dev to production.
4. Verify Railway deploy and production schema.

## 4. Architecture Model

The app is organized as a modular monolith with domain-first boundaries.

Current module/service areas:

- `auth`: login, signup, password reset, 2FA, session guards, global admin checks
- `profile`: profile data, avatar/banner, bio, resume, Scientology profile, themes
- `stream`: feed reads/writes, post types, ranking, stream preferences
- `social-graph`: friendships, friend requests, follows, blocks, mutes
- `groups`: group lifecycle, memberships, join requests, roles, forum, events, photos, documents
- `events`: standalone event CRUD, invitations, event moderators
- `messages`: direct message threads, messages, presence, read state
- `notifications`: notifications, alerts, push subscriptions, dings settings
- `media`: uploads, gallery albums/photos, tags, storage quota, secure upload handling
- `search`: people search and discovery pages
- `production-zone`: browse/create gating for production-oriented features
- `membership`: subscription tier rules, invitations, storage limits, ads, and permission gating
- `marketplace`: Bazaar listings
- `jobs`: hiring board listings
- `auditors`: auditor directory listings and media
- `admin`: audit viewing, petitions, global admin affordances

Shared code lives under `src/lib`. Extracted domain services currently exist under `src/modules`, with stream and groups service extraction started.

## 5. Authentication, Security, And Access

Account security:

- Email/password authentication
- Password reset tokens
- Email verification tokens
- Two-factor setup and verification
- Password policy and bot guard helpers
- Session version support for invalidation
- Auth security event logging

Global admin:

- Global admin access is represented by `User.role === "ADMIN"`.
- Bootstrap admin emails are:
  - `mavnetllc@gmail.com`
  - `julianne.dearmon@gmail.com`
- Bootstrap admins are promoted through `ensureBootstrapAdmins`.
- Admins bypass scoped moderation checks.
- Admin access is not included in Free, Contributor, or Pro membership.

Membership and invitations:

- `User.subscriptionTier` currently exists and defaults to `FREE`.
- The intended membership model is invite-based.
- Free members cannot invite.
- Contributor members should become eligible to invite qualified people after 6 months.
- Pro members should become eligible to invite qualified people after 6 months.
- Admins can always invite.
- Eligible member invites do not require admin approval by default.
- Signup should be blocked without a valid one-time invitation code.
- Invitation codes expire after 7 days.
- Expired invitations can be resubmitted without a new fee if an application fee is later added.
- Invitations are linked to both the inviter and the invited person.
- Invited members start as Free and can upgrade after signup.
- Invited people must complete a qualification form.
- Qualification should confirm they are currently active Scientologists in good standing.
- Qualification form fields should include current org, last service date, last service name, good-standing confirmation, and agreement to private membership terms.
- An initial application fee is possible later, but not decided yet.
- Invite limits should exist for normal members.
- Admins can assign a special Prophet invite exception for members who should bypass normal invite limits.
- Invitations can be revoked before acceptance.
- Invite create, approve, reject, revoke, expire, resubmit, and accept actions should be audit logged.
- Tier gates are expected to control feed type changes, storage, group size, Bazaar posting, hiring posting, event creation, ads, invitations, and moderation eligibility.
- Current implementation has some production-zone gating in place, but the full tier policy matrix still needs to be implemented consistently across UI and APIs.

Secure areas:

- `/profile/edit`
- `/profile/gallery`
- `/profile/scientology`
- `/profile/resume`
- `/settings`
- `/settings/theme`

Secure-area behavior:

- User must already be logged in.
- User re-enters password at `/secure-area`.
- A dedicated secure-area cookie is issued.
- Secure-area session expires after 15 minutes of inactivity.
- Secure-area APIs require the short-lived unlock.
- Client attempts to revoke the unlock on tab or browser close.

Future sensitive sections should default to secure-area protection, especially billing, production tools, donations, payout tools, admin controls, and moderator controls.

## 6. Current Data Model

Core identity and profile:

- `User`
- `Profile`
- `Theme`
- `UserFeedPreference`
- `TwoFactorConfig`
- `PasswordResetToken`
- `EmailVerificationToken`
- `UserKeyMaterial`
- `AuthSecurityEvent`

Membership and tier state:

- `User.subscriptionTier`
- `User.role`

Stream and discussion:

- `Post`
- `PostPoll`
- `PostPollOption`
- `PostPollVote`
- `Comment`
- `Reaction`

Social graph:

- `FriendRequest`
- `Friendship`
- `UserFollow`
- `MutedUser`
- `UserBlock`
- `MutedTopic`
- `FollowedTopic`

Messaging:

- `MessageThread`
- `Message`

Groups:

- `Group`
- `GroupMember`
- `GroupJoinRequest`
- `GroupEvent`
- `GroupForumThread`
- `GroupForumPost`
- `GroupDocument`
- `GroupPhoto`
- `GroupPhotoAlbum`

Events:

- `Event`
- `EventInvitation`
- `EventModerator`

Media and gallery:

- `PhotoAlbum`
- `Photo`
- `PhotoComment`
- `UserMediaTag`
- `PhotoAlbumTag`
- `PhotoTag`
- `UserUploadAsset`

Business and discovery:

- `BazaarListing`
- `JobListing`
- `AuditorListing`
- `AuditorMedia`

Admin and moderation:

- `ModeratorActionLog`
- `AdminPetition`

Notifications:

- `Notification`
- `Alert`
- `AlertSubscription`

## 7. Current Feature Areas

### Feed And Posts

- Home feed and profile stream pages exist.
- Posts support text/media/share/poll-oriented schema fields.
- Posts include audience, topic, approval status, resharing permission, and comments lock fields.
- Comments support parent comments and media URLs.
- Reactions are unique per user/post/type.
- Feed preferences support chronological/ranked modes, hidden posts, topic weights, close friends, stream-post rules, mobile nav side, and dings settings.
- Intended tier rule: Free members cannot change feed type.

### Profiles

- Public profile pages exist by username.
- Profile edit is protected by secure-area unlock.
- Profile includes display name, headline, bio, detailed bio JSON, location, interests, relationship status, avatar, banner, and theme.
- Resume and Scientology profile sections have dedicated pages and secure edit surfaces.
- Resume and Scientology profile visibility are controlled by profile fields.

### Gallery And Media

- Profile gallery page exists.
- User photo albums and photos are modeled separately.
- Albums and photos support visibility and user-defined tags.
- Photo comments and comment locking are modeled.
- Upload routes exist for gallery, group photos, media, and general uploads.
- Upload validation, storage abstraction, compression, quota, and S3-compatible storage helpers exist.

### Friends, Follows, Blocks, And Search

- Friends page exists.
- Friend request, mutual friend, suggestions, remove, and request-response APIs exist.
- User follow model exists.
- User block model and blocked-users page exist.
- Mutes and topic follows/mutes are modeled.
- People search API and search page exist.

### Messaging

- Messages inbox and thread pages exist.
- Direct message thread APIs exist.
- Message create/update/delete routes exist.
- Thread presence route exists.
- Thread access helper exists.
- Push subscription client is present for messaging-related notifications.

### Groups

- Groups index and group detail pages exist.
- Group create/list API exists.
- Group visibility and join mode are modeled.
- Group join request API exists.
- Group creator starts as `MODERATOR` on new groups.
- Group owner, creator-role members, and moderator-role members can moderate.
- Group moderators can approve/deny join requests, assign roles, and kick members.
- Group documents, photos, albums, forums, and group events are represented by pages/routes/APIs.
- Intended tier rule: Free members can create groups up to 10 members but cannot assign other moderators.
- Intended tier rule: Contributor and Pro members can create unlimited-size groups and assign group moderators.

### Events

- Standalone events page exists.
- Event create/list API exists.
- Event detail update/delete API exists.
- Events support title, description, start/end time, location name, coordinates, Google Maps URL, and visibility.
- Event invitations are modeled.
- Event creators are automatically event moderators.
- Event creators and event moderators can manage events.
- Event list includes events a user created, was invited to, or moderates.
- Intended tier rule: Contributor and Pro members can create events.
- Intended tier rule: Free members can participate where allowed but cannot create events.

### Notifications And Alerts

- Notifications page exists.
- Alerts page exists.
- Notification open route exists.
- Notification subscription API exists.
- Alert subscriptions are modeled.
- Notification and alert ding settings are available through settings.

### Bazaar

- Bazaar page exists.
- Bazaar listing create/list and update/delete APIs exist.
- Listings include seller, title, description, price, currency, location, category, status, timestamps.
- Bazaar access is governed by production-zone policy where applicable.
- Intended tier rule: Free members can view Bazaar listings but cannot create listings.
- Intended tier rule: Contributor and Pro members can create Bazaar listings.
- Intended tier rule: Contributor and Pro members can create ads for Bazaar listings.

### Jobs

- Jobs page exists.
- Jobs API exists.
- Listings include creator, company, title, duties, requirements, salary range, location, employment type, status, timestamps.
- Intended tier rule: Free members can view the hiring board.
- Intended tier rule: Contributor and Pro members can create hiring posts.

### Find An Auditor

- Auditor directory page exists.
- Auditor profile page exists.
- "I'm an Auditor" page exists.
- Auditor listing create/list API exists.
- Listings include class level, location fields, travel availability, looking-for-PCs status, training, credentials, specialty courses, bio, services, success stories, text stream, and pro flag.
- Auditor media is modeled.
- Intended tier rule: Free, Contributor, and Pro members can use Find an Auditor.

### Production Zone

- Production Zone page exists.
- Policy route exists.
- Current policy resolves browse/create access.
- Browsing is open.
- Creation requires invited-creator status and a paid subscription tier.
- Current production-zone feature identifiers include Bazaar, Writers Studio, and Business Profile.
- Intended tier rule: creation privileges should align with Contributor and Pro capabilities, contributor any feature-specific invite requirements.

### Ads

- Ads are part of the intended platform model but are not yet fully represented as a dedicated current data model.
- Intended tier rule: Free members cannot create ads.
- Intended tier rule: Contributor members can create ads for Bazaar and event listings, but not for businesses.
- Intended tier rule: Pro members have broader ad access and receive monthly ad credits.
- Ad credits still need a defined data model and monthly allocation policy.

### Admin And Moderation

- Admin page exists.
- Admin audit API exists.
- Admin petitions are modeled.
- Moderator action log is modeled.
- Global admins have full access and bypass scoped moderation checks.
- Scoped group and event moderation helpers exist.
- Intended tier rule: Free members can never be site moderators.
- Intended tier rule: Contributor and Pro members can be moderators by invite.
- Intended tier rule: membership tier does not grant admin access.

## 8. Current Pages

Top-level app pages:

- `/`
- `/home`
- `/admin`
- `/alerts`
- `/auditors`
- `/auditors/im-an-auditor`
- `/auditors/[auditorId]`
- `/bazaar`
- `/blocked-users`
- `/events`
- `/friends`
- `/groups`
- `/groups/[groupId]`
- `/jobs`
- `/messages`
- `/messages/[threadId]`
- `/notifications`
- `/posts/[postId]`
- `/production-zone`
- `/profile/edit`
- `/profile/gallery`
- `/profile/resume`
- `/profile/scientology`
- `/profile/[username]`
- `/profile/[username]/resume`
- `/profile/[username]/scientology`
- `/search`
- `/secure-area`
- `/settings`
- `/settings/theme`

Auth pages:

- `/login`
- `/login/2fa`
- `/signup`
- `/reset-password`
- `/reset-password/confirm`

## 9. API Surface

Auth and security:

- `/api/auth/[...nextauth]`
- `/api/auth/signup`
- `/api/auth/verify-email`
- `/api/auth/password-reset/request`
- `/api/auth/password-reset/confirm`
- `/api/auth/2fa/setup`
- `/api/auth/2fa/verify`
- `/api/auth/secure-area/unlock`
- `/api/auth/secure-area/ping`
- `/api/auth/secure-area/revoke`

Profile, settings, and preferences:

- `/api/profile`
- `/api/profile/resume`
- `/api/profile/scientology`
- `/api/profile/[username]/stream-posts`
- `/api/profile/stream-posts/[postId]/approve`
- `/api/settings/theme`
- `/api/settings/mobile-navigation`
- `/api/settings/notification-dings`
- `/api/settings/stream-rules`
- `/api/feed/preferences`

Feed and posts:

- `/api/posts`
- `/api/posts/[postId]`
- `/api/posts/[postId]/comments`
- `/api/posts/[postId]/reactions`
- `/api/posts/[postId]/share`
- `/api/posts/[postId]/poll/vote`
- `/api/posts/[postId]/poll/results`
- `/api/feed/archive`

Media and gallery:

- `/api/upload`
- `/api/media/[...key]`
- `/api/gallery/albums`
- `/api/gallery/photos`
- `/api/gallery/photos/[photoId]`
- `/api/gallery/photos/[photoId]/comments`
- `/api/gallery/tags`
- `/api/gallery/usage`

Social graph:

- `/api/friends/request`
- `/api/friends/request/[requestId]`
- `/api/friends/remove`
- `/api/friends/mutual`
- `/api/friends/suggestions`
- `/api/connections/bulk`
- `/api/blocks`
- `/api/blocks/[blockId]`
- `/api/search/people`

Messaging:

- `/api/messages/threads`
- `/api/messages/threads/[threadId]`
- `/api/messages/threads/[threadId]/messages`
- `/api/messages/threads/[threadId]/messages/[messageId]`
- `/api/messages/threads/[threadId]/presence`

Groups:

- `/api/groups`
- `/api/groups/[groupId]/join`
- `/api/groups/[groupId]/leave`
- `/api/groups/[groupId]/join-requests/[requestId]`
- `/api/groups/[groupId]/members/role`
- `/api/groups/[groupId]/members/[memberUserId]`
- `/api/groups/[groupId]/events`
- `/api/groups/[groupId]/documents`
- `/api/groups/[groupId]/photos`
- `/api/groups/[groupId]/photos/[photoId]`
- `/api/groups/[groupId]/photos/bulk`
- `/api/groups/[groupId]/photo-albums`
- `/api/groups/[groupId]/forum/threads`
- `/api/groups/[groupId]/forum/threads/[threadId]/posts`

Events and business surfaces:

- `/api/events`
- `/api/events/[eventId]`
- `/api/bazaar`
- `/api/bazaar/[listingId]`
- `/api/jobs`
- `/api/auditors`
- `/api/production-zone/policy`

Notifications, admin, and diagnostics:

- `/api/notifications/subscriptions`
- `/api/notifications/open`
- `/api/admin/audit`
- `/api/petitions`
- `/api/diagnostics/storage`

## 10. Deployment And Operations

Current stable/rollback state:

- Latest production backup tag: `stable/admin-moderator-scoped-2026-06-02`
- Latest production backup bundle: `C:\Repos\thetansplace\_private\backups\circlenest-prod-admin-moderator-scoped-2026-06-02.bundle`
- Latest dev commit: `431c8bc`
- Latest production commit: `3588c64`

Operational docs:

- `docs/RUNBOOK.md`
- `docs/operations/REPO_ARCHITECTURE.md`
- `docs/operations/STABLE_POINTS_AND_ROLLBACK.md`
- `docs/operations/HANDOFF-2026-06-02.md`

Useful scripts:

- `npm run dev`
- `npm run build`
- `npm run db:generate`
- `npm run db:seed`
- `npm run db:push:pg`
- `npm run db:generate:pg`
- `npm run stable:create`
- `npm run stable:list`
- `npm run stable:rollback`
- `npm run docker:up`
- `npm run docker:down`
- `npm run docker:logs`

Ops scripts:

- `ops/backup.ps1`
- `ops/backup.sh`
- `ops/restore.sh`
- `scripts/stable-point-create.ps1`
- `scripts/stable-point-list.ps1`
- `scripts/stable-point-rollback.ps1`

## 11. Validation State

Most recent validated state:

- Dev Prisma client regenerated successfully.
- Dev build passed with `npm run build`.
- Production build passed with `npm run build`.
- Production Postgres schema was synced through Railway.
- Production repo was committed and pushed to `origin/main`.

Current smoke-test focus:

- Group moderation:
  - approve and deny join requests
  - promote and demote members
  - kick members
- Event moderation:
  - create event
  - verify creator is a moderator
  - add moderator usernames
  - verify edit/delete access

## 12. Near-Term Blueprint Priorities

Immediate:

- Implement a centralized tier policy matrix for Free, Contributor, and Pro.
- Apply tier policy checks consistently across UI and APIs.
- Smoke test scoped group moderation.
- Smoke test scoped event moderation.
- Confirm production behavior after Railway deploy.
- Keep production schema aligned with the Postgres Prisma schema.

Next product hardening:

- Expand admin/moderator portal into a dedicated secure area.
- Add clearer audit trails for destructive moderation actions.
- Confirm all scoped moderation APIs enforce permissions server-side.
- Add role-management UX polish for groups and events.
- Add event moderator add/remove lifecycle if not already complete in UI.
- Define storage limits per tier.
- Define invite eligibility and qualification rules.
- Define ads, ad credits, and business-ad permissions.

Roadmap themes already documented:

- Stream/gallery UX and comment controls
- Core social extensions
- Events as a standalone domain
- Production Zone browse/create policy
- Bazaar marketplace
- Hiring board
- Find an Auditor vertical
- Admin/moderator portal

## 13. Addendum: Recently Added Capabilities

### Membership, Invitation, And Qualification

- Invite-only membership with one-time invitation codes.
- Invitation codes expire after 7 days and can be resubmitted when needed.
- Signup includes invitation code entry and qualification fields.
- Qualification captures:
  - current org
  - last service done
  - last service date
  - good-standing confirmation
  - private-membership agreement
- Invitation review, approval, resubmission, rejection, acceptance, and revocation are audit logged.
- Admins can grant invite-limit exceptions.

### Tier Model And Access Policy

- Canonical membership tiers now include:
  - `FREE`
  - `CONTRIBUTOR`
  - `PRO`
  - `AUDITOR`
  - `ADMIN`
- Admin access stays role-based and separate from paid tiers.
- Tier policy now drives:
  - event creation
  - Bazaar listing creation
  - hiring post creation
  - feed-type changes
  - group moderator assignment
  - group capacity
  - ad creation and ad credits
  - storage limits

### Secure Areas And Admin Mode

- Sensitive account sections are protected by secure-area unlock.
- Secure-area access is short-lived and time-boxed.
- Admin mode is separate from the base login session.
- Admin controls are only exposed after admin-mode and secure-area checks.

### Social Stream, Messaging, And Notifications

- Stream composer uses the "Communicate something!" interaction pattern.
- Direct messages, comments, and replies share a common message/thread model.
- Thread views support chat-style interaction, read state, failed-send handling, and media replies.
- Notifications and alerts are linked to the item they refer to and can mark read on open.
- Mobile and desktop navigation have been reworked around drawer/stream behavior.

### Groups, Events, And Production Zone

- Group browsing now favors joined groups first, with search-based discovery.
- Group ownership and moderator roles are distinct.
- Free-created groups are capped at 10 members.
- Standalone events remain separate from groups and are invite-based.
- Production Zone now includes:
  - Bazaar
  - Hiring Board / Find a Job
  - Find an Auditor
  - I'm an Auditor
  - Business Profile
  - Writers Studio
  - Fund Raisers

### Marketplace, Hiring, Auditors, And Fund Raisers

- Bazaar listings are card-based and searchable.
- Hiring listings are card-based, searchable, and expandable for the full description.
- Auditor discovery is split between finding auditors and auditors posting their own listings.
- Fund raisers are a separate surface with banner media, discussion/comments, ads, and organizer transparency.

### Ads, Credits, And Financial Visibility

- Ad placements support weighted cycling.
- Ads can be boosted with spend and boost factors.
- Listing-level ads and ad-stream placement are supported.
- Admin console work includes monthly financial reporting, ledger visibility, credit adjustments, and boost controls.

### Media, Storage, And Mobile

- Image uploads are backed by R2-compatible storage.
- Uploads are compressed before storage.
- Gallery/storage usage is tracked per account.
- Mobile app work targets persistent sign-in behavior, device auth, and notification settings.

### Admin And Moderation

- Admin console supports:
  - member tier changes
  - account recovery
  - ad credit adjustments
  - ad boost controls
  - announcements
  - audit log review
- Site-wide moderation and scoped moderation remain separate concerns.
- Moderator and admin actions are logged for future review.
