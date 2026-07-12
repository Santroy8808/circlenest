# Notifications Alerts

## Purpose

Separate ordinary activity notifications from important account/platform alerts.

## User-Facing Surfaces

- Notifications inbox.
- Alerts inbox.
- Control-panel unread counts.
- Notification dings settings.

## Primary Code Areas

- `src/modules/notifications-alerts`
- `src/components/notifications`
- `src/app/notifications`
- `src/app/alerts`

## Data Ownership

- `Notification`
- `Alert`

## Core Workflows

- Show mentions, replies, messages, invites, admin announcements.
- Show reports, petitions, invoices, receipts in alerts.
- Mark read without dead pages.

## Implemented Slice

- Count/list service with short DB timeout for app shell safety.
- App shell unread badges for notifications and alerts.
- `/notifications` and `/alerts` protected inbox pages.
- `/api/notifications/read` and `/api/alerts/read` mark-read endpoints.
- Hover-lift cards that keep text inside the card bounds.

## Access Rules

User sees only their notifications and alerts. Admin can create platform notices through admin module.

## Integrations

Feed, groups, events, mail, chat, billing, admin.

## Current Design Notes

Hover lift must preserve text visibility and border spacing.

## Mobile App Enablement List

Notifications are primarily a mobile-app experience. Before mobile launch, enable and verify:

- Push-notification permission request, denial recovery, and device-token registration.
- Per-device push enable/disable controls without exposing unavailable internal-mail preferences.
- Deep links from pushes to posts, replies, messages, family requests, alerts, and admin announcements.
- Foreground notification banners, background delivery, unread badge synchronization, and mark-read synchronization.
- Quiet hours, notification sounds, vibration, and operating-system notification-channel settings.
- Device-token rotation, logout cleanup, revoked-session cleanup, duplicate-push prevention, and delivery retry handling.
- Privacy-safe push text for private posts, private galleries, groups, and message conversations.
- Multi-device behavior, offline recovery, expired-content handling, and accessibility testing.

## Smoke Checklist

- Control panel counts update.
- Invite click resolves to a live destination.
