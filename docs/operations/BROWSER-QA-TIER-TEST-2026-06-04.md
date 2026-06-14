# Browser QA Tier Test

Date: 2026-06-04
Target: `http://localhost:3000`
Method: Actual browser interaction only. No code scan. No fixes applied in this pass.
Audience: Codex 5.4 mini

## Scope

Test goals:

1. Visual UX cleanliness and organization
2. Click through and use each feature
3. Confirm lower tiers cannot do upper-tier actions
4. Review workflow clarity
5. Identify missing or misplaced interface pieces by tier

Accounts used:

- Free: `tierfree@theta-space.dev`
- Contributor: `tieractivist@theta-space.dev`
- Biz: `tierbiz@theta-space.dev`
- Admin: `tieradmin@theta-space.dev`

## Overall Result

- Tier gating is partly working.
- Several important workflow and UX issues were confirmed through browser use.
- The highest-impact issue is broken sign-out, which blocks clean account switching in the app browser.

## Findings

### 1. Broken Sign-Out Form

- Severity: High
- Area: Auth / Workflow
- Tiers: All
- What happened:
  - Opened `/api/auth/signout`
  - Clicked the visible `Sign out` button in the browser
  - Button did not complete logout
  - Form inspection showed the form action posts to `http://localhost:3001/api/auth/signout`
- Expected:
  - Sign-out should post back to the active app origin on port `3000`
- Risk:
  - Blocks clean switching between test accounts
  - Breaks normal logout workflow
- Recommended fix:
  - Ensure auth base URL and sign-out form action use the active app origin
  - Verify NextAuth/Auth.js origin configuration for local development
  - Add a browser smoke test for login then logout on the current origin

### 2. Free User Can See Feed Type Control

- Severity: High
- Area: Tier UX / Policy
- Tiers: Free
- What happened:
  - Logged in as Free
  - On `/home`, the page showed `Your current plan is Free`
  - The page also showed a visible `Stream type` control with options like `Chronological`, `Friends First`, `Interest Based`, `Quiet`, `Discovery`
- Expected:
  - Free users should not have visible feed type controls if that feature is tier-locked
- Risk:
  - Tier promise and UI behavior are inconsistent
  - Users may think a locked feature is available or partially broken
- Recommended fix:
  - Hide or replace the feed type control for Free users
  - Show a compact tier-lock message instead
  - Keep server enforcement as the final guard

### 3. Contributor, Pro, And Admin Create Screens Render Duplicate Forms

- Severity: High
- Area: Visual UX / Workflow
- Tiers: Contributor, Pro, Admin
- What happened:
  - On `/events`, two `Event title` inputs were present
  - On `/bazaar`, two `Listing title` inputs were present
  - On `/jobs`, two `Company name` inputs were present
- Expected:
  - Each page should render one clear create form
- Risk:
  - Pages feel cluttered and unfinished
  - Users may fill the wrong form or think the page is broken
- Recommended fix:
  - Identify why create clients are rendering twice
  - Remove duplicate form mount or duplicate section composition
  - Add a browser regression check that asserts only one primary form per page

### 4. Free Tier Gating For Events, Bazaar, And Hiring Looks Correct

- Severity: Pass
- Area: Tier Enforcement / UI
- Tiers: Free
- What happened:
  - `/events` showed `Events locked` and disabled create fields
  - `/bazaar` showed `Bazaar locked` and disabled create fields
  - `/jobs` showed `Hiring board locked` and disabled create fields
- Expected:
  - Free should not be able to create these items
- Recommended follow-up:
  - Keep this behavior
  - Add a browser smoke test that confirms disabled create controls for Free

### 5. Free Group Limit Messaging Is Present

- Severity: Pass with follow-up
- Area: Groups / Tier UX
- Tiers: Free
- What happened:
  - `/groups` showed `Free group limit`
  - The page stated that groups created by Free users are capped at `10 members`
- Expected:
  - Free users should be informed of the cap
- Recommended follow-up:
  - Keep the message
  - Add a clearer placement near group creation and group management surfaces

### 6. Non-Admin Access To `/admin` Silently Bounces To `/home`

- Severity: Medium
- Area: Workflow / Access Clarity
- Tiers: Free and likely other non-admin users
- What happened:
  - Navigating to `/admin` as a non-admin did not show a clear forbidden state
  - Browser ended up on `/home`
- Expected:
  - Non-admin users should see a clear `not authorized` or `admin only` message
- Risk:
  - Silent redirect feels confusing
  - Harder to tell whether the route is locked or broken
- Recommended fix:
  - Replace the silent bounce with an explicit permission screen or inline access message
  - Keep the route protected while improving clarity

### 7. Admin Secure-Area Return Flow Lands On `/settings` Instead Of `/admin`

- Severity: High
- Area: Admin Workflow / Secure Area
- Tiers: Admin
- What happened:
  - Opened `/admin`
  - Was sent to secure-area unlock as expected
  - Entered password and unlocked
  - Browser landed on `/settings` instead of returning to `/admin`
- Expected:
  - Unlock should return the admin user to the originally requested page
- Risk:
  - Breaks the admin workflow
  - Makes the admin area feel unavailable or unstable
- Recommended fix:
  - Preserve and honor the `next` target during secure-area unlock
  - Add a browser test for `/admin` -> secure area -> `/admin`

### 8. Contributor `Invites` Navigation Is Misplaced Or Incomplete

- Severity: Medium
- Area: Invitation Workflow / Navigation
- Tiers: Contributor
- What happened:
  - Unlocked settings as Contributor
  - Clicked `Invites`
  - Browser went to `/friends#invites`
  - The page behaved like friends UI, not a dedicated invitation-management surface
- Expected:
  - Contributor users should have a clear invite-management page or section with invite-specific actions and status
- Risk:
  - Invite flow is hard to discover
  - Users may not understand where invitation tools live
- Recommended fix:
  - Create or route to a dedicated invites screen
  - Show eligibility, invite count, invite history, resend/revoke actions, and qualification state there

### 9. Subscription Surface Is Not Very Clear In Settings

- Severity: Medium
- Area: Billing / Membership UX
- Tiers: Contributor, Pro, likely Free
- What happened:
  - `My Subscription` routed to `settings#subscription`
  - The visible settings content did not strongly surface subscription details during the browser pass
- Expected:
  - Tier, benefits, limits, upgrade options, and billing state should be clearly visible
- Risk:
  - Users may not understand what plan they have or what changes with upgrade
- Recommended fix:
  - Give subscription a dedicated settings panel or page section with strong headings and tier details
  - Add current tier, feature summary, and relevant next actions

### 10. Contributor Can Create Events, Bazaar Listings, And Hiring Posts

- Severity: Pass
- Area: Tier Enforcement / Core Flows
- Tiers: Contributor
- What happened:
  - Created an event successfully
  - Created a Bazaar listing successfully
  - Created a job post successfully
- Expected:
  - Contributor should be able to create these items
- Recommended follow-up:
  - Keep this behavior
  - Add browser smoke coverage for all three create flows

### 11. Pro Can Create Events, Bazaar Listings, And Hiring Posts

- Severity: Pass
- Area: Tier Enforcement / Core Flows
- Tiers: Pro
- What happened:
  - Created an event successfully
  - Created a Bazaar listing successfully
  - Created a job post successfully
- Expected:
  - Pro should be able to create these items
- Recommended follow-up:
  - Keep this behavior
  - Add browser smoke coverage for all three create flows

## Missing Or Misaligned Interface Pieces

These did not all represent hard failures, but they should be reviewed:

- Free users should not see feed type controls if the feature is locked
- Non-admin users should get a clear admin access-denied state
- Admin secure-area flow should return to the requested admin page
- Contributor invite tools need a dedicated, obvious invitation management surface
- Subscription details need stronger visibility in settings
- Events, Bazaar, and Jobs create pages need duplicate form cleanup

## Recommended Fix Order

1. Fix sign-out origin mismatch
2. Fix admin secure-area return target
3. Remove duplicate create forms from Events, Bazaar, and Jobs
4. Hide or tier-lock feed type controls for Free users
5. Add a dedicated invite-management surface for eligible users
6. Replace silent admin redirect with a clear access-denied experience
7. Improve subscription visibility in settings

## Recommended Next Step For Codex 5.4 Mini

Do not fix everything at once. Use separate passes:

1. Auth workflow pass
   - sign-out origin
   - secure-area return target
2. Tier UX pass
   - Free feed type visibility
   - admin access-denied state
   - subscription visibility
3. Visual cleanup pass
   - duplicate create forms on Events, Bazaar, Jobs
4. Invitation UX pass
   - dedicated invite-management surface
