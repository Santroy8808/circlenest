# Mail

## Purpose

Provide internal formal mail, built to later support external domain email.

## User-Facing Surfaces

- Mail app.
- Compose.
- Inbox/sent/archive.
- Contacts drawer.

## Primary Code Areas

- `src/modules/mail`
- `src/components/mail`
- `src/app/mail`

## Data Ownership

- future mail message, folder, contact, recipient, preference tables.

## Core Workflows

- Search people by profile data.
- Send to non-friends.
- Add recipients to contacts after sending.
- Multi-recipient internal mail.
- Paid mass-mail controls.

## Access Rules

Blocks and advertising-mail preferences are respected.

## Integrations

Contacts, membership policy, credits, notifications, admin global settings.

## Current Design Notes

Mail is not chat. Use a compact Gmail-like mental model.

## Smoke Checklist

- Compose to non-friend works.
- Multiple recipients work.
- Contacts persist separately from friends.

