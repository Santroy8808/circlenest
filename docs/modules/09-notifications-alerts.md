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

## Smoke Checklist

- Control panel counts update.
- Invite click resolves to a live destination.
