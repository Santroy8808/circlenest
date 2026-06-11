# Theta-Space Project Plan: Tier Policy Foundation

Last updated: 2026-06-10

## Objective

Build the membership tier foundation that lets Theta-Space grow cleanly.

Primary goal:

- Create one central policy source for Free, Plus, Pro, and Admin access.

Secondary goals:

- Apply that policy to the highest-impact APIs first.
- Keep UI behavior aligned with server-side rules.
- Preserve current admin and scoped moderation behavior.
- Make future billing, invites, storage, ads, and moderation work easier to add.

## Current Context

Theta-Space is a private, invitation-based, multi-tier social platform for Scientologists.

Current tiers:

- Free: limited access, limited storage, can message/comment/post, create a group up to 10 people, join groups, view hiring board, find an auditor, view Bazaar listings.
- Plus: can create Bazaar listings, hiring posts, events, ads for Bazaar/event listings, unlimited-size groups, assign group moderators, increased storage, possible site moderator by invite, invite qualified people after 6 months.
- Pro: full non-admin access, can be moderator, monthly ad credits.
- Admin: separate from paid tier, global full access.

Current repo:

- Dev repo: `C:\Repos\thetansplace\circlenest-dev`
- Production repo: `C:\Repos\thetansplace\circlenest`
- Working rule: edit dev, backup prod, push dev to prod.

Current useful docs:

- `docs/BLUEPRINT-OUTLINE.md`
- `docs/operations/HANDOFF-2026-06-02.md`
- `docs/architecture/modular-monolith.md`
- `docs/SECURE_AREAS.md`

Current useful code:

- `src/lib/auth/admin.ts`
- `src/lib/auth/scoped-moderation.ts`
- `src/lib/policy/production-zone.ts`
- `src/lib/media/storage-quota.ts`
- `src/app/api/events/route.ts`
- `src/app/api/bazaar/route.ts`
- `src/app/api/jobs/route.ts`
- `src/app/api/groups/route.ts`
- `src/app/api/groups/[groupId]/members/role/route.ts`
- `src/app/api/feed/preferences/route.ts`
- `src/app/events/page.tsx`
- `src/app/bazaar/page.tsx`
- `src/app/jobs/page.tsx`
- `src/app/groups/page.tsx`
- `src/components/groups/group-detail-client.tsx`

## Execution Rules For Codex 5.4 Mini

- Work in `C:\Repos\thetansplace\circlenest-dev`.
- Do not edit production directly.
- Keep changes small and commit-ready.
- Prefer one phase per coding session.
- Read the referenced files before editing.
- Keep admin behavior intact.
- Enforce access on APIs before relying on UI.
- Do not add billing or Stripe in this plan.
- Do not build the full ads system in this plan.
- Do not rename existing subscription tiers without checking all usages.
- Use `npm run build` as the minimum verification after implementation phases.

## Phase 1: Central Tier Policy Matrix

Purpose:

- Create one shared source of truth for tier capabilities.

Expected new file:

- `src/lib/policy/tier-policy.ts`

Implementation shape:

- Define a normalized tier type:
  - `FREE`
  - `PLUS`
  - `PRO`
  - `ADMIN`
- Normalize unknown/null tiers to `FREE`.
- Treat `User.role === "ADMIN"` as admin override.
- Keep paid tier and admin role separate.

Suggested exports:

- `type MembershipTier`
- `type TierPolicy`
- `normalizeMembershipTier(value)`
- `resolveUserAccessPolicy(user)`
- `getTierPolicy(tier)`
- `canCreateEvent(policy)`
- `canCreateBazaarListing(policy)`
- `canCreateHiringPost(policy)`
- `canChangeFeedType(policy)`
- `canCreateGroup(policy)`
- `getMaxCreatedGroupMembers(policy)`
- `canAssignGroupModerators(policy)`
- `canBeSiteModerator(policy)`
- `canCreateAds(policy)`
- `getMonthlyAdCredits(policy)`
- `getStorageLimitBytes(policy)`

Initial policy values:

- Free:
  - can create group: true
  - max created group members: 10
  - can assign group moderators: false
  - can create event: false
  - can create Bazaar listing: false
  - can create hiring post: false
  - can change feed type: false
  - can be site moderator: false
  - can create ads: false
  - monthly ad credits: 0
  - storage limit: choose existing Free/default storage behavior if already defined, otherwise leave as a named constant.
- Plus:
  - can create group: true
  - max created group members: null/unlimited
  - can assign group moderators: true
  - can create event: true
  - can create Bazaar listing: true
  - can create hiring post: true
  - can change feed type: true
  - can be site moderator: true by invite only
  - can create ads: true
  - monthly ad credits: 0 unless later defined
  - storage limit: increased but undefined, use named placeholder constant.
- Pro:
  - includes Plus
  - can be site moderator: true by invite
  - can create ads: true
  - monthly ad credits: named placeholder constant
  - storage limit: higher placeholder constant.
- Admin:
  - full access
  - max group members: unlimited
  - admin access remains role-based, not subscription-based.

Deliverable:

- Central policy file exists.
- No behavior change yet except any internal tests/type checks.

Verification:

- `npm run build`

## Phase 2: Server-Side API Enforcement

Purpose:

- Apply the tier policy where it matters most.

Target APIs:

- `src/app/api/events/route.ts`
- `src/app/api/bazaar/route.ts`
- `src/app/api/jobs/route.ts`
- `src/app/api/groups/route.ts`
- `src/app/api/groups/[groupId]/members/role/route.ts`
- `src/app/api/feed/preferences/route.ts`

Rules to enforce:

- Free cannot create standalone events.
- Free cannot create Bazaar listings.
- Free cannot create hiring posts.
- Free can create groups, but created groups should be capped at 10 members.
- Free cannot assign group moderators.
- Free cannot change feed type.
- Plus/Pro can create events.
- Plus/Pro can create Bazaar listings.
- Plus/Pro can create hiring posts.
- Plus/Pro can assign moderators in groups they are allowed to moderate.
- Admin bypasses tier restrictions.

Implementation notes:

- Fetch only needed user fields:
  - `id`
  - `role`
  - `subscriptionTier`
- Use central policy helpers.
- Return `403` for blocked actions.
- Keep response messages short and specific.
- Do not weaken existing auth checks.
- Do not remove scoped moderation checks.

Deliverable:

- Tier restrictions enforced at server level for the listed APIs.

Verification:

- `npm run build`
- Manual API smoke checks if local auth fixtures exist.

## Phase 3: Group Size Cap Enforcement

Purpose:

- Make Free-tier group size limit real.

Target code:

- `src/app/api/groups/[groupId]/join/route.ts`
- `src/app/api/groups/[groupId]/join-requests/[requestId]/route.ts`
- Any service code in `src/modules/groups/groups.service.ts` that creates or approves memberships.

Rules:

- If group owner/creator is Free, group membership cannot exceed 10 people.
- Plus/Pro/Admin group creators can have unlimited group members.
- Admin can override if needed.
- Pending join requests can exist, but approval should fail if approving would exceed the cap.

Implementation notes:

- Determine group creator/owner tier from `Group.owner`.
- Count current group members before adding/approving.
- Use central policy max member rule.
- Return `403` or `409`; prefer `403` for permission/tier denial, `409` for capacity conflict.

Deliverable:

- Free-created groups cannot grow beyond 10 members.

Verification:

- `npm run build`
- Manual smoke:
  - Free creates group.
  - Add/approve members until 10.
  - 11th member is blocked.

## Phase 4: UI Locks And Upgrade Prompts

Purpose:

- Make the UI match server rules.

Target pages/components:

- `src/app/events/page.tsx`
- `src/app/bazaar/page.tsx`
- `src/app/jobs/page.tsx`
- `src/app/groups/page.tsx`
- `src/components/groups/group-detail-client.tsx`
- `src/app/settings/page.tsx`
- `src/components/settings/stream-rules-settings.tsx`

UI rules:

- Hide or disable create event controls for Free.
- Hide or disable create Bazaar listing controls for Free.
- Hide or disable create hiring post controls for Free.
- Show group size limit messaging for Free group creators.
- Disable group moderator assignment for Free group creators.
- Disable feed type controls for Free.
- Show concise upgrade prompts where an action is blocked.

Implementation notes:

- Prefer server-derived user policy where possible.
- Do not rely only on client-side checks.
- Keep copy direct and short.
- Avoid building a full pricing page in this phase.

Deliverable:

- Main user-facing controls reflect current tier.

Verification:

- `npm run build`
- Manual browser smoke:
  - Free user sees locked controls.
  - Plus/Pro user sees enabled controls.
  - Admin sees full access.

## Phase 5: Admin Tier Management

Purpose:

- Let admins view and adjust member tiers without touching the database manually.

Target code:

- `src/app/admin/page.tsx`
- New or existing admin API routes under `src/app/api/admin`
- `src/lib/auth/admin.ts`

Needed features:

- Admin-only list/search users.
- Show email, username, role, subscription tier, created date.
- Change subscription tier between Free, Plus, Pro.
- Do not allow paid tier to grant Admin.
- Admin role changes should remain separate and deliberate.

Security:

- Require logged-in admin.
- Consider secure-area protection for admin tools.
- Add audit log entry when tier is changed.

Deliverable:

- Admin can manage membership tiers.

Verification:

- `npm run build`
- Manual smoke:
  - Non-admin blocked.
  - Admin can change tier.
  - Tier change affects policy-gated actions.

## Phase 6: Tier Gate Tests And Smoke Scripts

Purpose:

- Prevent future drift.

Suggested files:

- Add focused test helpers if the repo already has a testing pattern.
- If no test framework exists, add a lightweight script or documented manual smoke checklist under `docs/operations`.

Minimum coverage:

- Free cannot create event.
- Plus can create event.
- Free cannot create Bazaar listing.
- Plus can create Bazaar listing.
- Free cannot create hiring post.
- Plus can create hiring post.
- Free cannot change feed type.
- Free group cannot exceed 10 members.
- Free group creator cannot assign moderator role.
- Plus group creator can assign moderator role.
- Admin bypasses tier restrictions.

Deliverable:

- Repeatable smoke checklist or automated tests.

Verification:

- `npm run build`
- Run any new test/smoke command if added.

## Phase 7: Future Work After Tier Foundation

Do after Phases 1-6:

- Invite-only membership system.
- Plus 6-month invite eligibility.
- Qualified-invite approval flow.
- Paid subscription/billing integration.
- Subscription status sync and downgrade handling.
- Storage limit enforcement and usage display.
- Site-wide moderator invitation system.
- Moderator dashboard.
- Admin/moderator secure-area protection.
- Full moderation action audit coverage.
- Ads data model.
- Monthly Pro ad credits.
- Bazaar listing ads.
- Event listing ads.
- Business ad permissions.
- Business profile feature.
- Writers Studio feature.
- Tier-aware onboarding.

## Recommended Session Breakdown

Session 1:

- Phase 1 only.
- Build central tier policy file.
- Run build.

Session 2:

- Phase 2 API enforcement for events, Bazaar, jobs, and feed preferences.
- Run build.

Session 3:

- Phase 2/3 group enforcement.
- Focus on group create, member approval, role assignment, group cap.
- Run build.

Session 4:

- Phase 4 UI locks.
- Run build and browser smoke.

Session 5:

- Phase 5 admin tier management.
- Run build and manual admin smoke.

Session 6:

- Phase 6 tests or smoke checklist.
- Run all available verification.

## Definition Of Done

The tier foundation is done when:

- One central policy file controls tier capabilities.
- The main APIs enforce tier capabilities.
- Free, Plus, Pro, and Admin behavior is consistent across events, Bazaar, jobs, groups, and feed settings.
- UI does not invite users to perform actions the server will reject.
- Admin can change member tiers.
- A repeatable smoke checklist or test suite covers the core tier gates.
- `npm run build` passes.

## Addendum: Recently Added Product Surfaces

The following feature areas are now part of the active dev surface around the tier foundation and should be kept in sync with future policy work:

- Invite-only membership and qualification flow.
- Secure-area and admin-mode protection for sensitive sections.
- Admin console for tier changes, account recovery, ledger access, announcements, and ad boosts.
- Weighted ad cycling and ad-credit handling.
- Fundraisers with banner media, discussion, ads, and organizer transparency.
- Separate Production Zone surfaces for Bazaar, Hiring Board, Find an Auditor, I'm an Auditor, Business Profile, and Writers Studio.
- Message, thread, notification, and mobile navigation refinements.
- Media upload, compression, and storage quota handling.
- Auditor tier behavior alongside Free, Plus, Pro, and Admin.

Future policy updates should continue to treat these surfaces as first-class neighbors to the tier system, even when they are not directly enforced by Phase 1-6.
