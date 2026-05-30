# Secure Areas

Certain parts of Theta-Space use a second security layer on top of the normal logged-in session.

## What counts as a secure area right now

These routes currently require a fresh secure-area unlock:

- `/profile/edit`
- `/profile/gallery`
- `/profile/scientology`
- `/profile/resume`
- `/settings`
- `/settings/theme`

These areas were chosen because they contain private profile data, account recovery details, resume data, media management, and settings that can materially affect the account.

## How it works

The secure-area system is a short-lived step-up session:

- The user must already be logged in normally.
- When entering a secure area, the user is sent to `/secure-area`.
- They must re-enter their password to unlock that area.
- A dedicated secure-area cookie is issued after successful verification.
- That secure-area session expires after `15 minutes` of inactivity.
- Secure-area APIs also require the same short-lived unlock, not just the regular login session.

## Idle timeout

Secure areas automatically lock after `15 minutes` of inactivity.

The client refreshes the secure-area session during active use, but if the user stops interacting long enough, the secure area is revoked and the user is redirected back through the unlock flow.

## Tab and browser close behavior

Secure areas attempt to revoke themselves when the page is fully closed or unloaded, so reopening those areas should require a fresh unlock.

This protection is intended for:

- closing the tab
- closing the browser
- leaving the secure area and returning later

## Future high-security zones

Future sections like:

- business/production tools
- donations
- subscription management
- payout or billing tools
- admin or moderator controls

should be treated as secure areas by default.

## Future hardening ideas

For especially sensitive sections, we may want stronger step-up verification than password re-entry alone:

- secondary password
- TOTP / authenticator 2FA challenge
- role-based stricter timeout windows
- stricter API segregation for financial and business operations
- action-level re-authentication for especially risky changes

## Implementation notes

Current implementation pieces:

- secure-area token utilities:
  - `src/lib/security/secure-area.ts`
- page/API enforcement helpers:
  - `src/lib/security/secure-area-guards.ts`
- unlock page:
  - `src/app/secure-area/page.tsx`
- unlock/ping/revoke endpoints:
  - `src/app/api/auth/secure-area/*`
- client idle and unload handling:
  - `src/components/security/secure-area-session-client.tsx`

If a new area can expose, retain, or modify important user or business information, it should either:

- be added to the secure-area route list, or
- be designed from the start as a secure area.
