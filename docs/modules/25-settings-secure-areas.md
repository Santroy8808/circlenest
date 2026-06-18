# Settings Secure Areas

## Purpose

Keep settings organized and protect only sensitive actions.

## User-Facing Surfaces

- Settings hub.
- Profile settings.
- Security settings.
- Subscription.
- Notification rules.
- Invite controls.

## Primary Code Areas

- `src/modules/settings-secure-areas`
- `src/components/settings`
- `src/app/settings`
- `src/app/secure-area`

## Data Ownership

- User preferences and secure session state.

## Core Workflows

- Settings cards only.
- Password prompt for sensitive settings.
- No secure prompt for My Pics.
- Idle secure-area timeout.

## Access Rules

Sensitive areas require fresh secure session. Normal gallery browsing does not.

## Integrations

Auth, profile, membership, notifications, invitations, admin mode.

## Current Design Notes

Avoid settings pages with many unrelated forms.

## Smoke Checklist

- My Pics opens without second password.
- Sensitive account settings require unlock.

