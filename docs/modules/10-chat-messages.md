# Chat Messages

## Purpose

Provide quick, live-feeling direct and group chat, separate from mail.

## User-Facing Surfaces

- Chat page.
- Chat dock.
- Compact movable/resizable desktop window.
- Mobile chat page.

## Primary Code Areas

- `src/modules/chat-messages`
- `src/components/messages`
- `src/app/messages`

## Data Ownership

- future chat thread, participant, message, presence tables.

## Core Workflows

- Open direct or group chat.
- Send text, images, and files.
- Drag/drop attachments.
- Track unread.

## Access Rules

Members can chat subject to blocks and moderation.

## Integrations

Notifications, media, social graph, reports.

## Current Design Notes

Push-token registration belongs in APK install flow, not desktop UI.

## Smoke Checklist

- Chat dock is compact.
- Attachments upload.
- No duplicate messages.

