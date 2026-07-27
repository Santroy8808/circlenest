# Feedback Support

## Purpose

Provide a floating, in-context **Feedback** flow for members and one shared **Tickets** workspace for authorized administrators.

## User-Facing Surfaces

- Persistent `Feedback` button for every authenticated account, including administrators.
- Compact overlay form that appears only after the button is clicked, preserves the underlying page layout, and captures its full internal URL.
- Configurable Feedback Types: Bug, Feature Request, Usability, Content, Account or Access, Safety or Moderation, Billing, and Other.
- Optional tab-only screenshot capture with preview, removal, compression, verification, and private storage.
- Submission confirmation with a reference number and no member-facing ticket thread.
- Administrator messages arrive to the submitter as ordinary Comm Center messages.
- Legacy member ticket URLs redirect away from ticket details.

## Administrator Surface

- One `Tickets` entry under Admin > Settings.
- Shared compact list at `/admin/tickets`.
- Combined search, Feedback Type filters, status and assignment filters, sorting, selection, and bulk actions.
- Assignment, routing, optimistic concurrency checks, Comm Center messages, Internal Notes, resolution, reopening, unread state, and audit history.
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
- Ticket lists, ticket details, ticket messages, history, and status are administrator-only.
- Internal Notes never enter member-facing payloads or Comm Center delivery.
- Active `ADMIN` and `GOD` accounts can view, assign, route, reply, add Internal Notes, resolve, reopen, and inspect diagnostic context.
- Screenshot delivery permits only an active administrator.

## Smoke Checklist

- Feedback opens as a modal without changing the current URL.
- The source URL remains the URL captured when the modal opened.
- Screenshot capture accepts only a browser-tab capture, previews it, and allows removal.
- Submitting with and without a screenshot returns a ticket number.
- Repeated submit clicks or message retries do not create duplicates.
- Member ticket list, detail, and message endpoints do not exist.
- Tickets appears once in Admin navigation.
- Search, Feedback Type, status, assignment, and sorting work together.
- Assignment and routing update the row, add history, and reject stale versions.
- Message User creates one normal Comm Center message; Internal Notes do not leave the ticket.
- Resolve and reopen preserve the ticket thread and history.
- Private screenshot retrieval returns not found for an unrelated member.
