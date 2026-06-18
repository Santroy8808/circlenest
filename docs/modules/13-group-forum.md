# Group Forum

## Purpose

Support focused group discussions with readable thread structure.

## User-Facing Surfaces

- Forum thread list.
- Full thread view.
- Reply bubble.

## Primary Code Areas

- `src/modules/group-forum`
- `src/components/groups/forum`
- `src/app/groups/[groupId]`

## Data Ownership

- future group forum thread, post, reaction, preference tables.

## Core Workflows

- Threads collapsed by default.
- Click thread for full vertical view.
- End own thread.
- Moderators can delete ended threads.
- Reply with RTF, emoji, and photos when allowed.

## Access Rules

Members can post. Creator/moderators enforce rules.

## Integrations

Groups, notifications, media, moderation, reports.

## Current Design Notes

Forum UI should feel like chat bubbles inside a group, not a generic admin forum.

## Smoke Checklist

- Create Forum opens wizard.
- Ended thread hides from normal interaction.

