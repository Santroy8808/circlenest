# Theta-Space Codex Prompt Plan

Last updated: 2026-06-02

Use one concept at a time. Do not run the whole document as one prompt.

Each concept is independent. Only follow the explicit next-prompt instruction at the end of each phase.

## Concept 1: Tier Policy Foundation

### Concept 1-1: Central Tier Policy Matrix

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- docs/PROJECT-PLAN-TIER-POLICY.md
- docs/operations/HANDOFF-2026-06-02.md

Goal:
Create the central tier policy matrix for Free, Plus, Pro, and Admin.

Requirements:
- Add src/lib/policy/tier-policy.ts
- Define normalized tiers: FREE, PLUS, PRO, ADMIN
- Normalize unknown/null tiers to FREE
- Treat User.role === "ADMIN" as admin override
- Keep paid tier and admin role separate
- Export helpers for event creation, Bazaar creation, hiring creation, feed type changes, group creation, group member cap, group moderator assignment, site moderator eligibility, ads, ad credits, and storage limits
- Do not enforce behavior in APIs yet
- Do not edit production
- Keep the change small and buildable

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 1-2: Server-Side Tier Enforcement
```

### Concept 1-2: Server-Side Tier Enforcement

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- docs/PROJECT-PLAN-TIER-POLICY.md
- src/lib/policy/tier-policy.ts

Goal:
Apply the central tier policy to the highest-impact APIs.

Target files:
- src/app/api/events/route.ts
- src/app/api/bazaar/route.ts
- src/app/api/jobs/route.ts
- src/app/api/groups/route.ts
- src/app/api/groups/[groupId]/members/role/route.ts
- src/app/api/feed/preferences/route.ts

Rules:
- Free cannot create standalone events
- Free cannot create Bazaar listings
- Free cannot create hiring posts
- Free can create groups, but group size cap is handled in the next phase
- Free cannot assign group moderators
- Free cannot change feed type
- Plus and Pro can create events, Bazaar listings, hiring posts, and assign group moderators where otherwise authorized
- Admin bypasses tier restrictions
- Preserve existing auth and scoped moderation checks
- Do not edit production
- Do not add billing, invites, ads, storage enforcement, or UI changes

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 1-3: Free Group Size Cap
```

### Concept 1-3: Free Group Size Cap

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- docs/PROJECT-PLAN-TIER-POLICY.md
- src/lib/policy/tier-policy.ts

Goal:
Enforce the Free-tier group size cap.

Target files:
- src/app/api/groups/[groupId]/join/route.ts
- src/app/api/groups/[groupId]/join-requests/[requestId]/route.ts
- src/modules/groups/groups.service.ts

Rules:
- If a group owner/creator is Free, the group cannot exceed 10 members
- Plus, Pro, and Admin group creators can have unlimited group members
- Pending join requests may still exist
- Approval or direct join should fail if adding the member would exceed the Free-tier cap
- Return 409 for group capacity conflicts
- Preserve existing auth and moderation checks
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 1-4: UI Tier Locks
```

### Concept 1-4: UI Tier Locks

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- docs/PROJECT-PLAN-TIER-POLICY.md
- src/lib/policy/tier-policy.ts

Goal:
Add UI locks and upgrade prompts so the interface matches server-side tier rules.

Target files:
- src/app/events/page.tsx
- src/app/bazaar/page.tsx
- src/app/jobs/page.tsx
- src/app/groups/page.tsx
- src/components/groups/group-detail-client.tsx
- src/app/settings/page.tsx
- src/components/settings/stream-rules-settings.tsx

Rules:
- Free users see locked or disabled create controls for events, Bazaar listings, and hiring posts
- Free group creators see the 10-member group limit
- Free group creators cannot assign moderators in UI
- Free users cannot change feed type in UI
- Plus, Pro, and Admin users see enabled controls
- Keep copy short and direct
- Do not add billing, pricing pages, invites, ads, or storage enforcement
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 1-5: Admin Tier Management
```

### Concept 1-5: Admin Tier Management

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- docs/PROJECT-PLAN-TIER-POLICY.md
- src/lib/policy/tier-policy.ts
- src/lib/auth/admin.ts

Goal:
Build admin tier management so admins can view and adjust member tiers.

Target files:
- src/app/admin/page.tsx
- src/app/api/admin/*
- src/lib/auth/admin.ts

Requirements:
- Admin-only user list or search
- Show email, username, role, subscription tier, and created date
- Allow changing subscription tier between FREE, PLUS, and PRO
- Do not allow paid tier to grant ADMIN
- Keep admin role changes separate
- Add an audit log entry when a member tier changes
- Non-admin users must be blocked
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 1-6: Tier Gate Smoke Tests
```

### Concept 1-6: Tier Gate Smoke Tests

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- docs/PROJECT-PLAN-TIER-POLICY.md
- src/lib/policy/tier-policy.ts

Goal:
Add repeatable tier gate verification.

Requirements:
- If a test framework exists, add focused tests for tier policy and key gates
- If no test framework exists, add docs/operations/TIER-GATE-SMOKE-TESTS.md
- Cover Free, Plus, Pro, and Admin behavior
- Include events, Bazaar, hiring, feed type, group moderator assignment, and Free group cap
- Do not edit production

After implementation:
- Run npm run build
- Run any added test or smoke command if available
- Report files changed
- Report whether verification passed

Once done with this phase, stop. Do not start another concept unless the user asks.
```

## Concept 2: Invite-Only Membership

### Concept 2-1: Invitation Data Model

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- prisma/schema.prisma
- prisma/schema.postgres.prisma

Goal:
Add the invitation data model for private membership.

Requirements:
- Add invitation model(s) to both Prisma schemas
- Track inviter, invited person, invite code/token hash, status, qualification form fields, expiresAt, acceptedAt, revokedAt, resubmittedAt, createdAt
- Invitation code must be usable only once
- Invitation code must expire after 7 days
- Invitation must link to both the member doing the inviting and the person invited
- Store invited person's email, name, and optional phone if practical
- Store qualification fields:
  - current org receiving services
  - last service date
  - last service name
  - confirmation they are currently active as a Scientologist
  - confirmation they are in good standing with the Church
  - agreement to private membership terms and conditions
  - optional qualification/application notes
- Add support for optional future application fee tracking, but do not implement payment collection
- Add support for admin-assigned Prophet invite-limit exception if it fits cleanly in the data model
- Include statuses such as PENDING, ACCEPTED, EXPIRED, REVOKED, REJECTED, RESUBMITTED
- Do not implement email sending yet
- Do not edit production

After implementation:
- Run Prisma generate for Postgres schema
- Run npm run build
- Report files changed
- Report whether verification passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 2-2: Invitation Creation And Admin Approval
```

### Concept 2-2: Invitation Creation And Admin Approval

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/lib/policy/tier-policy.ts
- src/lib/auth/admin.ts

Goal:
Build invite creation and admin review APIs.

Requirements:
- Free members cannot invite
- Plus members may invite only after 6 months
- Pro members may invite only after 6 months
- Admins can always invite
- Eligible Plus/Pro member invites do not require admin approval by default
- Admins can create, approve, reject, revoke, expire, and resubmit invites
- Admins can assign or remove Prophet invite-limit exception status if the data model supports it
- Normal members should be subject to invite limits
- Prophet members should bypass normal invite limits
- Store the full qualification form
- Require invited person to agree to private membership terms and conditions
- Invitation code expires after 7 days
- Expired invitations can be resubmitted without collecting a new application fee
- Revoke must block later acceptance
- Audit log invite create, approve, reject, revoke, expire, resubmit, and accept actions
- Do not send emails yet
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 2-3: Invitation Acceptance Flow
```

### Concept 2-3: Invitation Acceptance Flow

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/app/(auth)/signup/page.tsx
- src/app/api/auth/signup/route.ts

Goal:
Require a valid invitation for signup.

Requirements:
- Add invite token validation to signup
- Block signup without a valid pending invite
- Invite code can be used only once
- Expired, revoked, rejected, or accepted invite codes cannot be used
- Mark invite accepted after successful signup
- Link accepted invite to the new user
- New invited users start as Free
- Users can upgrade only after they are inside the platform
- Keep existing signup security checks
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 2-4: Invitation UI
```

### Concept 2-4: Invitation UI

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/app/admin/page.tsx
- src/app/settings/page.tsx

Goal:
Add invite management UI.

Requirements:
- Admins can view, approve, reject, revoke, resubmit, and create invites
- Admins can view invite audit history where practical
- Admins can assign Prophet invite-limit exception status if implemented
- Eligible Plus/Pro members can send invites from settings after 6 months
- Free members see locked invite access
- Members who are not yet 6-month eligible see locked invite access
- Normal invite limits should be visible where practical
- Prophet invite-limit exception should be visible to admins where practical
- Invite form should collect current org, last service date, last service name, currently active confirmation, good-standing confirmation, terms agreement, and optional notes
- Keep UI simple and consistent with existing design
- Do not add billing
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, stop. Do not start another concept unless the user asks.
```

## Concept 3: Paid Subscription And Billing

### Concept 3-1: Billing Provider Foundation

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/lib/policy/tier-policy.ts
- prisma/schema.prisma
- prisma/schema.postgres.prisma

Goal:
Prepare the app for paid subscriptions without changing live billing yet.

Requirements:
- Add subscription/billing fields or model needed to track provider customer ID, subscription ID, tier, status, current period, cancellation state
- Keep User.subscriptionTier as the app-facing tier
- Do not integrate checkout yet
- Do not edit production

After implementation:
- Run Prisma generate for Postgres schema
- Run npm run build
- Report files changed
- Report whether verification passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 3-2: Checkout And Customer Portal
```

### Concept 3-2: Checkout And Customer Portal

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- docs/PROJECT-PLAN-TIER-POLICY.md

Goal:
Add checkout and billing portal endpoints for Plus and Pro.

Requirements:
- Add server routes for starting checkout
- Add server route for customer portal
- Keep provider keys in environment variables
- Do not hardcode secrets
- Do not change admin role behavior
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 3-3: Webhook Subscription Sync
```

### Concept 3-3: Webhook Subscription Sync

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/lib/policy/tier-policy.ts

Goal:
Sync subscription status and tier from billing webhooks.

Requirements:
- Add webhook route with signature verification
- Update subscription status and User.subscriptionTier from trusted billing events
- Handle active, past_due, canceled, unpaid, and trial states
- Downgrade access when subscription is no longer valid
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 3-4: Billing UI
```

### Concept 3-4: Billing UI

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/app/settings/page.tsx

Goal:
Add tier-aware billing controls.

Requirements:
- Show current tier and subscription status in settings
- Add upgrade buttons for Plus and Pro
- Add manage billing button for paid members
- Show downgrade/cancellation state
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, stop. Do not start another concept unless the user asks.
```

## Concept 4: Storage Limits

### Concept 4-1: Storage Policy Integration

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/lib/policy/tier-policy.ts
- src/lib/media/storage-quota.ts

Goal:
Connect storage limits to membership tier policy.

Requirements:
- Use getStorageLimitBytes from tier policy
- Preserve existing upload safety checks
- Apply tier-specific limit calculation
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 4-2: Upload Enforcement
```

### Concept 4-2: Upload Enforcement

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- src/app/api/upload/route.ts
- src/app/api/gallery/photos/route.ts
- src/app/api/groups/[groupId]/photos/route.ts
- src/lib/media/storage-quota.ts

Goal:
Enforce tier storage limits on upload APIs.

Requirements:
- Block uploads that exceed tier storage limit
- Return clear 403 or 409 response
- Keep existing MIME, size, and security checks
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 4-3: Storage Usage UI
```

### Concept 4-3: Storage Usage UI

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- src/app/settings/page.tsx
- src/app/profile/gallery/page.tsx
- src/app/api/gallery/usage/route.ts

Goal:
Show storage usage and tier limit to members.

Requirements:
- Display current usage and limit
- Show upgrade prompt when near or over limit
- Keep UI concise
- Do not add billing checkout unless already available
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, stop. Do not start another concept unless the user asks.
```

## Concept 5: Site-Wide Moderation

### Concept 5-1: Site Moderator Model

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/lib/auth/scoped-moderation.ts
- prisma/schema.prisma
- prisma/schema.postgres.prisma

Goal:
Create a clear site-wide moderator model separate from Admin and scoped group/event moderation.

Requirements:
- Add site moderator data model or role assignment model
- Only Plus/Pro users can be invited as site moderators
- Free users can never be site moderators
- Admin remains separate and full access
- Do not edit production

After implementation:
- Run Prisma generate for Postgres schema
- Run npm run build
- Report files changed
- Report whether verification passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 5-2: Site Moderator Invitation And Assignment
```

### Concept 5-2: Site Moderator Invitation And Assignment

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- src/lib/auth/admin.ts
- src/lib/policy/tier-policy.ts

Goal:
Allow admins to invite, grant, and revoke site moderator status.

Requirements:
- Admin-only APIs
- Validate user tier before granting moderator status
- Log grants and revocations
- Do not allow Free users to be site moderators
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 5-3: Moderator Dashboard
```

### Concept 5-3: Moderator Dashboard

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/app/admin/page.tsx

Goal:
Build a simple moderator dashboard for site moderators and admins.

Requirements:
- Show moderation queue or links to moderation actions
- Keep admin-only controls hidden from site moderators
- Site moderators should not get deployment/code/admin-tier controls
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 5-4: Moderator Secure Area And Audit Coverage
```

### Concept 5-4: Moderator Secure Area And Audit Coverage

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/SECURE_AREAS.md
- src/lib/security/secure-area-guards.ts
- src/app/admin/page.tsx

Goal:
Protect admin/moderator controls and expand audit logs.

Requirements:
- Add admin/moderator controls to secure-area protection where appropriate
- Ensure destructive moderation actions write audit logs
- Keep existing secure-area routes working
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, stop. Do not start another concept unless the user asks.
```

## Concept 6: Reporting And Content Review

### Concept 6-1: Report Data Model

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- prisma/schema.prisma
- prisma/schema.postgres.prisma

Goal:
Add content reporting data model.

Requirements:
- Support reports for posts, comments, photos, groups, events, Bazaar listings, jobs, auditor listings, and users
- Track reporter, target type/id, reason, details, status, assigned moderator, resolution, timestamps
- Do not edit production

After implementation:
- Run Prisma generate for Postgres schema
- Run npm run build
- Report files changed
- Report whether verification passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 6-2: Report Submission APIs And UI
```

### Concept 6-2: Report Submission APIs And UI

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md

Goal:
Let members report content and users.

Requirements:
- Add report submission API
- Add simple report UI on major content surfaces where practical
- Require logged-in user
- Prevent duplicate spam where practical
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 6-3: Content Review Queue
```

### Concept 6-3: Content Review Queue

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- src/app/admin/page.tsx
- docs/BLUEPRINT-OUTLINE.md

Goal:
Build admin/moderator content review queue.

Requirements:
- Admins and authorized site moderators can view reports
- Support status updates such as open, reviewing, resolved, dismissed
- Add resolution notes
- Log moderation actions
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, stop. Do not start another concept unless the user asks.
```

## Concept 7: Ads And Ad Credits

### Concept 7-1: Ads Data Model

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/lib/policy/tier-policy.ts
- prisma/schema.prisma
- prisma/schema.postgres.prisma

Goal:
Add ads and ad credits data model.

Requirements:
- Model ads for Bazaar listings and event listings
- Model monthly ad credit balance or ledger
- Free cannot create ads
- Plus can create Bazaar/event listing ads
- Pro receives monthly ad credits
- Business ads remain unavailable unless business permissions are added later
- Do not edit production

After implementation:
- Run Prisma generate for Postgres schema
- Run npm run build
- Report files changed
- Report whether verification passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 7-2: Ad Creation APIs
```

### Concept 7-2: Ad Creation APIs

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- src/lib/policy/tier-policy.ts
- src/app/api/bazaar/route.ts
- src/app/api/events/route.ts

Goal:
Add ad creation APIs for Bazaar and event listings.

Requirements:
- Enforce tier policy
- Free cannot create ads
- Plus can create Bazaar/event ads without monthly credits
- Pro can use monthly ad credits
- Validate ownership of the listing/event
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 7-3: Monthly Pro Ad Credits
```

### Concept 7-3: Monthly Pro Ad Credits

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/lib/policy/tier-policy.ts

Goal:
Implement monthly Pro ad credit allocation.

Requirements:
- Add idempotent allocation logic
- Allocate credits once per billing/month period
- Do not double-grant credits
- Add admin-visible ledger or audit trail if practical
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 7-4: Ads UI
```

### Concept 7-4: Ads UI

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- src/app/bazaar/page.tsx
- src/app/events/page.tsx

Goal:
Add UI for creating and viewing ads for Bazaar and event listings.

Requirements:
- Show ad creation only to eligible users
- Show Pro ad credit balance
- Keep business ads locked/unavailable
- Keep UI concise
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, stop. Do not start another concept unless the user asks.
```

## Concept 8: Business Profile And Writers Studio

### Concept 8-1: Business Profile Foundation

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/lib/policy/production-zone.ts
- prisma/schema.prisma
- prisma/schema.postgres.prisma

Goal:
Add Business Profile foundation.

Requirements:
- Add data model for member-owned business profile
- Gate creation to eligible tier/policy
- Keep business ads unavailable unless explicitly implemented later
- Do not edit production

After implementation:
- Run Prisma generate for Postgres schema
- Run npm run build
- Report files changed
- Report whether verification passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 8-2: Business Profile UI And API
```

### Concept 8-2: Business Profile UI And API

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/app/production-zone/page.tsx

Goal:
Add simple Business Profile create/view/edit flow.

Requirements:
- Eligible members can create and edit their business profile
- Other members can browse public business profiles if allowed
- Keep UI simple
- Do not add business ads
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 8-3: Writers Studio Foundation
```

### Concept 8-3: Writers Studio Foundation

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/lib/policy/production-zone.ts
- prisma/schema.prisma
- prisma/schema.postgres.prisma

Goal:
Add Writers Studio foundation.

Requirements:
- Add basic writing project/article data model
- Gate creation by tier/policy
- Allow browsing where policy permits
- Do not edit production

After implementation:
- Run Prisma generate for Postgres schema
- Run npm run build
- Report files changed
- Report whether verification passed

Once done with this phase, stop. Do not start another concept unless the user asks.
```

## Concept 9: Onboarding And Membership UX

### Concept 9-1: Tier-Aware Onboarding

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/app/(auth)/signup/page.tsx
- src/app/home/page.tsx

Goal:
Add tier-aware onboarding after signup/login.

Requirements:
- Show new members key next steps
- Explain Free limits briefly
- Guide Plus/Pro users to creation tools
- Do not add billing unless already implemented
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 9-2: Membership Comparison Page
```

### Concept 9-2: Membership Comparison Page

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/lib/policy/tier-policy.ts

Goal:
Add a membership comparison page.

Requirements:
- Compare Free, Plus, and Pro
- Make clear that Admin is separate and not a paid tier
- Include groups, events, Bazaar, hiring, ads, storage, invites, and moderator eligibility
- Keep copy direct
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 9-3: Paid Feature Gates UI
```

### Concept 9-3: Paid Feature Gates UI

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/lib/policy/tier-policy.ts

Goal:
Create reusable paid feature gate UI.

Requirements:
- Build a small reusable component for locked features
- Use it on major locked surfaces
- Keep messaging short
- If billing exists, link to upgrade flow
- If billing does not exist, link to membership comparison
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, stop. Do not start another concept unless the user asks.
```

## Concept 10: Production Operations And Smoke Testing

### Concept 10-1: Production Smoke Checklist

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/operations/HANDOFF-2026-06-02.md
- docs/RUNBOOK.md

Goal:
Add a production smoke-test checklist.

Requirements:
- Add docs/operations/PRODUCTION-SMOKE-TESTS.md
- Cover login, signup/invites, feed, posts, comments, messages, groups, events, Bazaar, jobs, auditors, uploads, admin, tier gates, moderation gates
- Keep it executable by a non-developer
- Do not edit production

After implementation:
- Run npm run build if code changed
- Report files changed
- Report whether verification passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 10-2: Automated Backup Verification
```

### Concept 10-2: Automated Backup Verification

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/operations/STABLE_POINTS_AND_ROLLBACK.md
- scripts/stable-point-create.ps1
- scripts/stable-point-list.ps1
- scripts/stable-point-rollback.ps1
- ops/backup.ps1
- ops/backup.sh

Goal:
Add backup verification documentation or scripts.

Requirements:
- Verify backup files exist after creation
- Document how to validate a backup can be listed/restored
- Keep commands safe and non-destructive by default
- Do not edit production

After implementation:
- Run npm run build if code changed
- Report files changed
- Report whether verification passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 10-3: Monitoring And Launch Checklist
```

### Concept 10-3: Monitoring And Launch Checklist

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/RUNBOOK.md
- docs/operations/HANDOFF-2026-06-02.md

Goal:
Add production monitoring and launch checklist documentation.

Requirements:
- Add docs/operations/LAUNCH-CHECKLIST.md
- Include Railway deploy checks, schema sync checks, build checks, backup checks, smoke tests, rollback path, and log locations
- Keep it direct and usable
- Do not edit production

After implementation:
- Run npm run build if code changed
- Report files changed
- Report whether verification passed

Once done with this phase, stop. Do not start another concept unless the user asks.
```

## Concept 11: User Safety, Terms, And Account Lifecycle

### Concept 11-1: Terms And Community Rules Acceptance

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- prisma/schema.prisma
- prisma/schema.postgres.prisma

Goal:
Track member acceptance of terms, privacy, and community rules.

Requirements:
- Add fields or model for accepted terms version and timestamp
- Require acceptance at signup or next login
- Keep implementation small
- Do not edit production

After implementation:
- Run Prisma generate for Postgres schema
- Run npm run build
- Report files changed
- Report whether verification passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 11-2: Account Deactivation And Deletion
```

### Concept 11-2: Account Deactivation And Deletion

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- prisma/schema.prisma
- prisma/schema.postgres.prisma
- src/app/settings/page.tsx

Goal:
Add account deactivation/deletion flow.

Requirements:
- Support deactivation first
- Add deletion request flow if full deletion is too large
- Protect with secure-area unlock
- Preserve auditability where needed
- Do not edit production

After implementation:
- Run Prisma generate for Postgres schema if schema changed
- Run npm run build
- Report files changed
- Report whether verification passed

Once done with this phase, now do this prompt in `docs/CODEX-PROMPT-PLAN.md`: Concept 11-3: Data Export
```

### Concept 11-3: Data Export

```text
You are working in C:\Repos\thetansplace\circlenest-dev.

Read these first:
- docs/BLUEPRINT-OUTLINE.md
- src/app/settings/page.tsx

Goal:
Add member data export.

Requirements:
- Add secure-area-protected export request
- Export profile, posts, comments, messages metadata where appropriate, groups, listings, and settings
- Keep sensitive/private data handling conservative
- Do not edit production

After implementation:
- Run npm run build
- Report files changed
- Report whether the build passed

Once done with this phase, stop. Do not start another concept unless the user asks.
```
