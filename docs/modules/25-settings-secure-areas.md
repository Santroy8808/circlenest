# Settings Secure Areas

## Purpose

Keep settings organized, card-first, and protect only sensitive actions behind a fresh secure unlock.

## User-Facing Surfaces

- `/settings` for the settings hub.
- `/settings/profile` for non-sensitive profile navigation.
- `/secure-area?next=...` for fresh unlock before sensitive areas.
- `/settings/security`
- `/settings/subscription`
- `/settings/notifications`
- `/settings/invite`

## Primary Code Areas

- `src/modules/settings-secure-areas`
- `src/components/settings-secure-areas`
- `src/app/settings`
- `src/app/secure-area`

## Data Ownership

- This phase does not add new schema.
- Future secure-session hardening should use server-backed secure session state rather than only client session storage.

## Core Workflows

- Member opens Settings.
- Member chooses a card.
- Non-sensitive Profile Settings opens directly.
- My Pics opens through `/profile/gallery`, not behind the secure wall.
- Sensitive cards route to Secure Area first.
- Secure Area unlock stores a 15-minute client-side marker and redirects to the target area.
- Sensitive pages refuse to show their placeholder panel until unlocked.

## Access Rules

- Login required for all settings pages.
- Sensitive routes require fresh secure unlock.
- Gallery/My Pics does not require a second password prompt.
- Future account/security mutations should enforce secure state server-side before writing.

## Integrations

- Auth for login state.
- Profile, My Scientology, and Gallery for non-sensitive profile links.
- Future invite, subscription, admin-mode, and notification preferences can attach their focused card/form pages here.

## Diagnostics And Audit

- This phase is primarily UX/routing.
- Future sensitive mutations must write audit logs where appropriate.

## Smoke Checklist

- `/settings` redirects logged-out users to login.
- `/settings/profile` links to `/profile/gallery` directly.
- `/settings/security` requires secure unlock before showing the settings placeholder.
- Dashboard shows Phase 25 as Ready and Phase 26 as Next.
