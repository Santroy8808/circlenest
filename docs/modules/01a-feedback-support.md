# Feedback Support

## Purpose

Provide a global issue-reporting path that is available from every page in the app.

## User-Facing Surfaces

- Floating `Report issue` control.
- Ticket creation page at `/feedback/new`.

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
- Creating a ticket writes a `FeedbackTicket` and initial `FeedbackTicketEvent`.
- The ticket records the page where the issue was reported.
