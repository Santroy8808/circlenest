# Feedback Support

## Purpose

Provide a global issue-reporting path and a Settings-based Feedback Center for support and product suggestions.

## User-Facing Surfaces

- Floating `Report issue` control.
- Ticket creation page at `/feedback/new`.
- Feedback Center at `/settings/feedback` for authenticated members.
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
- Logged-in reports attach to the current user.
- Logged-out reports may include an optional contact email.

## Access Rules

Ticket creation is available to authenticated and unauthenticated users. Ticket review and status changes will belong to the admin/moderation module.

## Integrations

Auth Security, Admin Moderation, Diagnostic Logs.

## Current Design Notes

The global entry point should stay small and visible without blocking normal app use.

## Smoke Checklist

- Floating report button appears on auth and app pages.
- Feedback Center appears in Settings and the Settings control-panel menu.
- The request-kind selector changes the guidance and accepts support and feature submissions.
- Creating a ticket writes a `FeedbackTicket` and initial `FeedbackTicketEvent`.
- The ticket records the page where the issue was reported.
