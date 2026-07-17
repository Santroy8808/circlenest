# Feedback Support

## Purpose

Provide a global issue-reporting path and a Settings-based Feedback Center for support and product suggestions.

## User-Facing Surfaces

- Floating `Report issue` control for eligible paid memberships and admins.
- Protected ticket creation page at `/feedback/new`; Free and signed-out users cannot submit support requests.
- Feedback Center at `/settings/feedback` for eligible paid memberships and admins.
- Each ticket is categorized as `Support request`, `Report a problem`, or `Feature request`.

## Primary Code Areas

- `src/modules/feedback-support`
- `src/components/feedback`
- `src/app/feedback/new`
- `src/app/api/feedback/tickets`

## Data Ownership

- `FeedbackTicket`
- `FeedbackTicketEvent`

## Core Workflows

- User clicks `Report issue` from any route.
- The page captures current route, user agent, viewport, severity, title, and description.
- The selected request kind is stored on the ticket so administrators can triage support, problems, and feature suggestions separately.
- Reports attach to the eligible authenticated user.

## Access Rules

Ticket creation requires `support.createRequest`, which is available to eligible paid memberships and admins. Free and signed-out users cannot open support tickets. Ticket review and status changes belong to the admin/moderation module.

## Integrations

Auth Security, Admin Moderation, Diagnostic Logs.

## Current Design Notes

The global entry point should stay small and visible without blocking normal app use.

## Smoke Checklist

- Floating report button appears only for accounts with `support.createRequest` access.
- Feedback Center appears in Settings and the Settings control-panel menu only for eligible accounts.
- The request-kind selector changes the guidance and accepts support and feature submissions.
- Free accounts do not see the report control, and direct page/API attempts are rejected.
- Creating a ticket writes a `FeedbackTicket` and initial `FeedbackTicketEvent`.
- The ticket records the page where the issue was reported.
