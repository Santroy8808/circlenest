# Theta-Space Context Index

This file is a map. Use it to load only the files needed for the active task.

## Active Repositories

- Desktop/API repo: `C:\Repos\Theta-Space-net\NewRepo`
- Android Theta-Space wrapper: `C:\Repos\Theta-Space-net\ThetaSpaceAndroidWrapper`
- ThetaComm Android app: `C:\Repos\Theta-Space-net\ThetaSpaceCommunicationsAndroid`

## Operational References

- Server update and SSH procedure: `docs/server-update-quick-reference.md`
- Feature completion standard: `docs/feature-completion-standard.md`
- Core product functions: `docs/core-functions.md`
- Human testing readiness: `docs/human-testing-readiness.md`
- Cutover runbook: `docs/cutover-runbook.md`
- Production snapshot: `docs/production-repo-snapshot.md`
- Active release audit: `docs/qa/2026-07-21-free-contributor-admin-release-audit.md`
- Gallery/conduct repair snapshot: `docs/handoff/snapshots/2026-07-21-gallery-conduct-repairs.md`

## High-Value Desktop Files

### App Shell, Layout, Theme

- Global CSS and theme rules: `src/app/globals.css`
- Main authenticated shell: `src/components/platform/app-shell.tsx`
- Shell counts API: `src/app/api/shell/counts/route.ts`
- Shell summaries API: `src/app/api/shell/summaries/route.ts`

### Stream, Posts, Comments, Reactions

- Home page route: `src/app/home/page.tsx`
- Feed components: `src/components/feed/`
- Feed service: `src/modules/feed/feed.service.ts`
- Feed post API: `src/app/api/feed/posts/route.ts`
- Feed comments API: `src/app/api/feed/comments/route.ts`
- Post reaction API: `src/app/api/feed/reactions/post/route.ts`
- Comment reaction API: `src/app/api/feed/reactions/comment/route.ts`

### Ads And Credits

- Ad manager UI: `src/components/ads-credits/ads-manager.tsx`
- Ad wizard UI: `src/components/ads-credits/create-ad-campaign-form.tsx`
- Ads service: `src/modules/ads-credits/ads-credits.service.ts`
- Ads types and validation: `src/modules/ads-credits/types.ts`
- Campaign API: `src/app/api/ads/campaigns/route.ts`
- Delivery API: `src/app/api/ads/delivery/route.ts`
- Hashtag targeting API: `src/app/api/ads/targeting/hashtags/route.ts`
- Business center create-ad page: `src/app/business-center/create-ad/page.tsx`
- Standalone ad create page: `src/app/ads/create/page.tsx`

### Market Listings

- Market list page: `src/app/market/page.tsx`
- Create listing page: `src/app/market/create/page.tsx`
- Edit listing page: `src/app/market/[listingId]/edit/page.tsx`
- Market listing form: `src/components/market/market-listing-form.tsx`
- Market service: `src/modules/market/market.service.ts`
- Market API: `src/app/api/market/route.ts`
- Market listing API: `src/app/api/market/[listingId]/route.ts`

### Gallery And Media

- Gallery page: `src/app/profile/gallery/page.tsx`
- Gallery detail page: `src/app/profile/gallery/[assetId]/page.tsx`
- Gallery upload page: `src/app/profile/gallery/upload/page.tsx`
- Media service: `src/modules/media/media.service.ts`
- Gallery storage service: `src/modules/gallery-media-storage/gallery-media-storage.service.ts`
- Durable Gallery deletion service/job: `src/modules/gallery-media-storage/gallery-media-deletion.service.ts`
- Shared media-reference fence: `src/lib/platform/media-asset-reference-fence.ts`
- Media upload intent API: `src/app/api/media/upload-intent/route.ts`
- Media complete upload API: `src/app/api/media/complete-upload/route.ts`
- Gallery deletion API: `src/app/api/media/assets/delete/route.ts`
- Avatar/banner media API: `src/app/api/profile/media/route.ts`
- Media asset API: `src/app/api/media/assets/[mediaAssetId]/route.ts`
- Media tags API: `src/app/api/media/assets/tags/route.ts`

### Messages, Chat, Mail

- Messages page: `src/app/messages/page.tsx`
- Messages service: `src/modules/chat/chat.service.ts`
- Chat APIs: `src/app/api/chat/`
- Mail page: `src/app/mail/page.tsx`
- Mail service: `src/modules/mail/mail.service.ts`
- Mail APIs: `src/app/api/mail/`

### People, Profiles, Social Graph

- People page: `src/app/people/page.tsx`
- Profile page: `src/app/profile/[username]/page.tsx`
- Edit profile page: `src/app/profile/edit/page.tsx`
- Social graph service: `src/modules/social-graph/social-graph.service.ts`
- Friend request API: `src/app/api/social-graph/friend-requests/route.ts`
- Family request API: `src/app/api/social-graph/family-requests/route.ts`

### Settings

- Settings index: `src/app/settings/page.tsx`
- Profile settings area: `src/app/settings/profile/page.tsx`
- Security settings area: `src/app/settings/security/page.tsx`
- Rules settings area: `src/app/settings/rules/page.tsx`
- Subscription settings area: `src/app/settings/subscription/page.tsx`
- Invite settings page: `src/app/settings/invite/page.tsx`
- My Scientology page: `src/app/profile/scientology/page.tsx`
- My Scientology API: `src/app/api/profile/scientology/route.ts`

### Admin

- Admin portal: `src/app/admin/page.tsx`
- Admin workflow pages: `src/app/admin/workflows/`
- Admin action pages: `src/app/admin/actions/[actionKey]/page.tsx`
- Admin moderation service: `src/modules/admin-moderation/admin-moderation.service.ts`
- Conduct report workspace UI: `src/components/admin-moderation/admin-conduct-review.tsx`
- Conduct UI/API contract: `src/components/admin-moderation/conduct-review-ui-contract.ts`
- Conduct admin API and bounded query: `src/app/api/admin/conduct/`
- Conduct admin operations: `src/modules/conduct-reporting/admin.service.ts`
- Conduct report creation: `src/modules/conduct-reporting/conduct-reporting.service.ts`
- Conduct disputes: `src/modules/conduct-reporting/disputes.service.ts`
- Versioned conduct transitions: `src/modules/admin-moderation/conduct-transitions.service.ts`

## Database And Generated Code

- Prisma schema: `prisma/schema.prisma`
- Prisma migrations: `prisma/migrations/`
- Generated Prisma client: `node_modules/@prisma/client` after `npx prisma generate`

Do not edit generated Prisma client files manually.

## Current Production Topology

- Production server: Windows Server 2022
- Public IP: `207.188.9.139`
- Production checkout: `S:\Workspace\circlenest`
- Production public site: `https://theta-space.net`
- App service behind Caddy listens on port `3000`
- Server update procedure is in `docs/server-update-quick-reference.md`

## Standing Push Rule

When the user explicitly says `push`, push local changes to GitHub and then update the production server over SSH. Do not push or deploy otherwise.
