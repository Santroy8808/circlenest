# Tier Gate Smoke Tests

Last updated: 2026-06-02

## Purpose

Use this checklist to verify the core tier gates for Free, Plus, Pro, and Admin without relying on manual database edits.

## Scope

This checklist covers:

- Events
- Bazaar listings
- Hiring posts
- Feed type changes
- Group moderator assignment
- Free-tier group size cap
- Admin bypass behavior

## Prerequisites

- Local dev app running or a deployed dev build available.
- One test account for each tier if possible:
  - Free
  - Plus
  - Pro
  - Admin
- If tier accounts are not available, use the Admin portal to set the `subscriptionTier` before each run.
- Clear browser session/cookies between tier swaps.

## Expected Tier Rules

| Capability | Free | Plus | Pro | Admin |
| --- | --- | --- | --- | --- |
| Create event | Blocked | Allowed | Allowed | Allowed |
| Create Bazaar listing | Blocked | Allowed | Allowed | Allowed |
| Create hiring post | Blocked | Allowed | Allowed | Allowed |
| Change feed type | Blocked | Allowed | Allowed | Allowed |
| Assign group moderators | Blocked | Allowed | Allowed | Allowed |
| Create group | Allowed | Allowed | Allowed | Allowed |
| Free-created group size cap | 10 members | Unlimited | Unlimited | Unlimited |

## Smoke Test Checklist

### 1. Free tier: event creation

1. Sign in as a Free user.
2. Open `/events`.
3. Confirm the create control is disabled, locked, or replaced with an upgrade prompt.
4. Attempt the event create API if needed.

Expected:

- UI blocks creation.
- API returns `403`.

### 2. Plus tier: event creation

1. Sign in as a Plus user.
2. Open `/events`.
3. Create a simple event.

Expected:

- Event creation succeeds.

### 3. Free tier: Bazaar listing creation

1. Sign in as a Free user.
2. Open `/bazaar`.
3. Confirm the create control is disabled or locked.
4. Attempt to create a listing if needed.

Expected:

- UI blocks creation.
- API returns `403`.

### 4. Plus tier: Bazaar listing creation

1. Sign in as a Plus user.
2. Open `/bazaar`.
3. Create a basic listing.

Expected:

- Listing creation succeeds.

### 5. Free tier: hiring post creation

1. Sign in as a Free user.
2. Open `/jobs`.
3. Confirm the create control is disabled or locked.
4. Attempt to create a job post if needed.

Expected:

- UI blocks creation.
- API returns `403`.

### 6. Plus tier: hiring post creation

1. Sign in as a Plus user.
2. Open `/jobs`.
3. Create a basic job post.

Expected:

- Job post creation succeeds.

### 7. Free tier: feed type changes

1. Sign in as a Free user.
2. Open `/settings/theme` or the stream preferences surface that contains feed type.
3. Confirm feed type controls are disabled or hidden.
4. Attempt to change feed type via API if needed.

Expected:

- UI blocks the change.
- API returns `403`.

### 8. Free-created group cap

1. Sign in as a Free user.
2. Create a group.
3. Add members until the group reaches 10 total members.
4. Attempt to add or approve an 11th member.

Expected:

- The first 10 members are allowed.
- The 11th member is blocked.
- Direct join or approval returns `409` when the group is full.

### 9. Free tier: group moderator assignment

1. Sign in as a Free group creator.
2. Open the group management surface.
3. Attempt to assign another member as moderator.

Expected:

- The UI blocks the assignment.
- API returns `403`.

### 10. Plus/Pro tier: group moderator assignment

1. Sign in as a Plus or Pro group creator.
2. Open the group management surface.
3. Assign another member as moderator.

Expected:

- The assignment succeeds.

### 11. Admin bypass

1. Sign in as an Admin user.
2. Repeat the event, Bazaar, hiring, feed type, and group moderator checks.

Expected:

- Admin can perform all allowed actions.
- Admin still keeps role-based access separate from paid tier.

## Pass Criteria

The tier gate pass is complete when:

- Free is blocked where expected.
- Plus and Pro are allowed where expected.
- Admin bypass works where expected.
- Free-created groups stop at 10 members.
- The UI matches the API behavior.

## Notes

- If a UI control is blocked, still verify the API returns the expected status code at least once.
- Keep admin role changes separate from subscription tier changes.
- Do not treat any paid tier as a substitute for `User.role === "ADMIN"`.

