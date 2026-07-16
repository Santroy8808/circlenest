# Theta-Space NewRepo Release Candidate

Generated: 2026-06-18T05:42:54.414Z

## Source

- Repo: `C:\Repos\Theta-Space-net\NewRepo`
- Branch: `main`
- Commit: `f71b501`
- Full commit: `f71b501c5a91c8d868a6d5e67f3cf3f48c947cc5`
- Worktree: clean when manifest was generated

## Current Readiness

- Ready modules: 29 of 29
- Next milestone: Live Cutover - Manual production promotion

## Ready Modules

- `platform-infrastructure` - Platform Infrastructure
- `feedback-support` - Feedback Support
- `auth-security` - Auth Security
- `membership-policy` - Membership Policy
- `profile-identity` - Profile Identity
- `my-scientology` - My Scientology
- `gallery-media-storage` - Gallery Media Storage
- `feed-stream` - Feed Stream
- `social-graph` - Social Graph
- `notifications-alerts` - Notifications Alerts
- `chat-messages` - Chat Messages
- `groups` - Groups
- `mail` - Mail
- `group-forum` - Group Forum
- `group-media-docs` - Group Media Docs
- `events` - Events
- `market` - Market
- `jobs` - Jobs
- `auditors` - Auditors
- `production-zone` - Production Zone
- `business-storefront` - Business Storefront
- `ads-credits` - Ads Credits
- `fundraisers-funds` - Fundraisers Funds
- `writers-corner` - Writers Corner
- `admin-moderation` - Admin Moderation
- `settings-secure-areas` - Settings Secure Areas
- `search-discovery` - Search Discovery
- `stripe-billing` - Stripe Billing
- `cutover-readiness` - Cutover Readiness

## Required Validation Commands

```powershell
npm run lint
npm run typecheck
npm run build
npm run cutover:check
npm run promote:dry-run
npm run services:readiness
```

## Browser QC Routes

- `/login` - login form and credentials flow
- `/home` - authenticated stream
- `/search` - protected privacy-aware search
- `/profile/gallery` - My Pics without secure-area prompt
- `/groups` - group directory and profile navigation
- `/mail` - mail-only client
- `/market` - square listing cards
- `/jobs` - clickable job cards and details
- `/feedback/new` - support ticket creation
- `/admin` - protected admin card/wizard interface

## Recent Commits

- `f71b501 Refresh cutover runbook services step`
- `cdaed5e Refresh promotion dry run services scope`
- `ad9fdf7 Add external services readiness report`
- `57b29f5 Add external services readiness tooling`
- `6059d22 Refresh release candidate dry run step`
- `8abdf42 Refresh cutover runbook dry run step`
- `1023e7a Add promotion dry run`
- `bf381d8 Add promotion dry run tooling`

## Production Boundary

- This manifest does not push to GitHub.
- This manifest does not migrate production PostgreSQL.
- This manifest does not touch the Windows production service.
- This manifest does not touch Cloudflare R2.
- Production promotion still requires an explicit approval, an archive tag, and live smoke verification.

## Rollback Reminder

Before production overwrite, tag the current production commit as `archive-YYYY-MM-DD.vN`. If smoke fails, rollback should target that explicit archive tag only after approval.
