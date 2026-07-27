# Feedback Support

## Purpose

Provide a floating, in-context **Feedback** flow for members and one shared **Tickets** workspace for authorized administrators.

## User-Facing Surfaces

- Persistent `Feedback` button for accounts with `support.createRequest`.
- In-tab modal that preserves the current page and captures its full internal URL.
- Configurable Feedback Types: Bug, Feature Request, Usability, Content, Account or Access, Safety or Moderation, Billing, and Other.
- Optional tab-only screenshot capture with preview, removal, compression, verification, and private storage.
- Member ticket list at `/settings/feedback`.
- Member conversation at `/feedback/tickets/[publicId]`.
- Legacy `/feedback/new` requests redirect to the member Feedback list.

## Administrator Surface

- One `Tickets` entry under Admin > Communications and Safety.
- Shared compact list at `/admin/tickets`.
- Combined search, Feedback Type filters, status and assignment filters, sorting, selection, and bulk actions.
- Assignment, routing, optimistic concurrency checks, Normal replies, Internal Notes, resolution, reopening, unread state, and audit history.
- Protected screenshot and saved source-page access.

## Primary Code Areas

- `src/modules/feedback-support`
- `src/components/feedback`
- `src/components/admin-moderation/admin-tickets-workspace.tsx`
- `src/app/feedback`
- `src/app/admin/tickets`
- `src/app/api/feedback`
- `src/app/api/admin/tickets`

## Data Ownership

- `FeedbackTicket`
- `FeedbackTicketMessage`
- `FeedbackTicketEvent`
- `FeedbackTicketReadState`
- Private `MediaAsset` records associated through `screenshotMediaAssetId`

## Access Rules

- Creation requires an authenticated account with `support.create`.
- A creator can retrieve only their own ticket and only Normal messages.
- Internal Notes are filtered on the server and never enter creator-facing payloads or notifications.
- Active `ADMIN` and `GOD` accounts can view, assign, route, reply, add Internal Notes, resolve, reopen, and inspect diagnostic context.
- Screenshot delivery permits only the ticket creator or an active administrator.

## Smoke Checklist

- Feedback opens as a modal without changing the current URL.
- The source URL remains the URL captured when the modal opened.
- Screenshot capture accepts only a browser-tab capture, previews it, and allows removal.
- Submitting with and without a screenshot returns a ticket number.
- Repeated submit clicks or message retries do not create duplicates.
- The member list and thread never expose Internal Notes or admin-only history.
- Tickets appears once in Admin navigation.
- Search, Feedback Type, status, assignment, and sorting work together.
- Assignment and routing update the row, add history, and reject stale versions.
- Normal replies notify the creator; Internal Notes do not.
- Resolve and reopen preserve the ticket thread and history.
- Private screenshot retrieval returns not found for an unrelated member.
