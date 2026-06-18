# Chat Messages

## Purpose

Provide quick, live-feeling direct and group chat, separate from mail. This is the casual conversation module, not the formal internal mail client.

## User-Facing Surfaces

- `/messages` chat page inside the main app shell.
- Thread list with search and direct/group filters.
- Member search for starting direct chats.
- Selected chat pane with messages, bubbles, and a bottom composer.
- File/image attachment queue in the composer.

## Primary Code Areas

- `src/modules/chat-messages`
- `src/components/messages`
- `src/app/messages`
- `src/app/api/chat`

## Data Ownership

- `ChatThread`
- `ChatParticipant`
- `ChatMessage`
- `ChatAttachment`
- `MediaAsset` records for R2-backed chat uploads

## Core Workflows

- Open direct or group chat.
- Send text, images, and files.
- Drag/drop attachments.
- Track unread.
- Search members by username, display name, email, or location.
- Mark selected chats as read.

## Access Rules

Members can chat subject to blocks and moderation. Users must be participants to read or write a thread. Direct chat creation is blocked when either member has blocked the other.

## Integrations

Notifications, media, social graph, reports.

## Current Design Notes

Push-token registration belongs in APK install flow, not desktop UI.

Phase 10 intentionally keeps chat separate from Mail. Mail gets formal folders, recipients, contacts, mass-mail controls, and future external email linking in Phase 11.

## Smoke Checklist

- `/messages` redirects logged-out users to login.
- Thread list loads without page-level DB crashes.
- Direct chat can be started from member search.
- Text messages append without full-page reload.
- File/image attachments use R2 direct upload and then send as chat attachments.
- Control panel unread message count uses chat unread state.
- No desktop push-token registration form is visible.
