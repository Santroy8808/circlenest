# Browser QA Tier Recheck

Date: 2026-06-04
Target: `http://localhost:3000`
Method: Actual browser interaction only
Audience: Codex 5.4 mini

## Scope

Retest goals:

1. Visual UX cleanliness and organization
2. Click through and use each feature
3. Confirm lower tiers cannot do upper-tier actions
4. Review workflow clarity
5. Identify missing or tier-misaligned interface pieces

Accounts used:

- Free: `tierfree@theta-space.dev`
- Activist: `tieractivist@theta-space.dev`
- Pro: `tierpro@theta-space.dev`
- Admin: `tieradmin@theta-space.dev`

## Recheck Summary

- Major previously reported issues were fixed.
- No tier-bypass was observed in this recheck.
- Core gated create flows behaved correctly for Free, Plus, Pro, and Admin.
- Admin secure-area flow now returns to the correct destination.

## Fixed Since Last Pass

### 1. Sign-Out Flow

- Status: Fixed
- What happened:
  - Opened `/api/auth/signout`
  - Clicked `Sign out`
  - Form posted to `http://localhost:3000/api/auth/signout`
  - Browser returned to the logged-out home/login page
- Result:
  - Sign-out now works

### 2. Free Feed Type Visibility

- Status: Fixed
- What happened:
  - Logged in as Free
  - Opened `/home`
  - `Stream type` control was not visible
- Result:
  - Free user no longer sees the feed-type control on home

### 3. Duplicate Primary Create Forms

- Status: Fixed
- What happened:
  - Plus and Pro opened `/events`, `/bazaar`, and `/jobs`
  - Only one primary create control set was found on each page:
    - `Event title`: 1
    - `Listing title`: 1
    - `Company name`: 1
- Result:
  - The duplicate main create forms are no longer present

### 4. Plus Invite Navigation

- Status: Fixed
- What happened:
  - Plus unlocked `/settings`
  - `Invites` now routes to `http://localhost:3000/settings#invitations`
  - Invite UI was visible in settings with invite limit and 6-month messaging
- Result:
  - Invite management is now in the expected settings area

### 5. Subscription Visibility

- Status: Fixed
- What happened:
  - Plus opened `My Subscription`
  - Settings showed current tier, billing status, upgrade controls, and billing state copy
- Result:
  - Subscription details are now clearly surfaced

### 6. Non-Admin `/admin` Handling

- Status: Fixed
- What happened:
  - Free, Plus, and Pro opened `/admin`
  - Each saw an explicit deny state with `Admin access only.`
- Result:
  - Non-admin users no longer get a confusing silent redirect

### 7. Admin Secure-Area Return

- Status: Fixed
- What happened:
  - Admin opened `/admin`
  - Admin was sent to secure area
  - After unlock, browser returned to `/admin`
- Result:
  - Admin secure-area return target is now correct

## Tier Behavior Recheck

### Free

- Home showed Free plan messaging
- Feed-type control was not visible
- `/events` showed `Events locked`
- `/bazaar` showed `Bazaar locked`
- `/jobs` showed `Hiring board locked`
- Create controls on those locked pages were disabled
- `/groups` showed Free group cap messaging
- `/admin` showed explicit admin-only deny state

Result:

- Free tier gates behaved correctly in this pass

### Plus

- `/events`, `/bazaar`, and `/jobs` create controls were enabled
- Plus successfully created:
  - event
  - Bazaar listing
  - job post
- Settings secure-area unlock worked
- Invite panel was visible in settings
- Subscription panel was visible in settings
- `/admin` showed explicit admin-only deny state

Result:

- Plus feature access behaved correctly in this pass

### Pro

- `/events`, `/bazaar`, and `/jobs` create controls were enabled
- Pro successfully created:
  - event
  - Bazaar listing
  - job post
- `/admin` required secure-area unlock
- Admin-only tools were not exposed to Pro

Result:

- Pro feature access behaved correctly in this pass

### Admin

- `/admin` required secure-area unlock
- After unlock, admin returned to `/admin`
- Admin portal showed:
  - site moderators area
  - member tier management
  - invite management
  - audit-oriented admin surfaces

Result:

- Admin workflow behaved correctly in this pass

## Lower-Tier To Upper-Tier Boundary Check

Observed result:

- Free could not create events
- Free could not create Bazaar listings
- Free could not create hiring posts
- Free did not see the home feed-type control
- Non-admin users were blocked from admin functionality
- Plus and Pro could access their expected create surfaces
- Admin-only functions stayed behind admin access

Result:

- No lower-tier bypass was observed during this browser recheck

## Non-Blocking UX Note

### Listing Pages Still Feel Visually Busy

- Severity: Low
- Area: Visual UX
- What happened:
  - Bazaar and Hiring Board pages stack repeated listing controls such as `ADS`, `REPORT`, and owner actions on every card
  - The pages work, but they feel dense during long-scroll browsing
- Recommended follow-up:
  - Compress secondary actions into clearer card sections or menus
  - Reduce repeated visual weight for report and ad blocks
  - Keep the successful gating and creation behavior unchanged

## Overall Result

- Recheck is green for the previously reported high-priority issues
- Tier boundaries behaved correctly
- Core gated workflows worked in real browser interaction
- No blocking issues were found in this recheck
