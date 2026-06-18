# Mail

## Purpose

Provide internal formal mail, built to later support external domain email. Mail is not chat; it uses folders, subjects, recipients, and contacts.

## User-Facing Surfaces

- `/mail` compact mail client.
- Compose pane.
- Inbox, Sent, and Archive folder controls.
- Contact search/contact list.
- Message reader pane.
- Multi-recipient chips.
- Mail preference toggle for internal mass mail.

## Primary Code Areas

- `src/modules/mail`
- `src/components/mail`
- `src/app/mail`
- `src/app/api/mail`

## Data Ownership

- `MailThread`
- `MailMessage`
- `MailRecipient`
- `MailAttachment`
- `MailContact`
- `MailPreference`
- `MailSenderOptOut`
- `MailPolicyConfig`

## Core Workflows

- Search people by profile data.
- Send to non-friends.
- Add recipients to contacts after sending.
- Multi-recipient internal mail.
- Paid mass-mail controls.
- Upload attachments through direct R2 handoff.
- Track unread mail separately from chat messages.
- Store admin-changeable mass-mail recipient caps and future credit cost.

## Access Rules

Blocks and advertising-mail preferences are respected. Free can send ordinary one-recipient internal mail. Contributor, Professional, Auditor, and Admin mass-mail caps are read from `MailPolicyConfig`.

## Integrations

Contacts, membership policy, credits, notifications, admin global settings.

## Current Design Notes

Mail is not chat. Use a compact Gmail-like mental model.

The current rich-text controls are a lightweight formatting foundation. A later editor pass can swap them for a full RTF editor without changing the mail data model.

## Smoke Checklist

- Compose to non-friend works.
- Multiple recipients work.
- Contacts persist separately from friends.
- Mail unread count appears separately from Messages.
- Mail attachments use R2 direct upload.
- No chat bubbles, chat drawer, or push-token registration UI is present.
