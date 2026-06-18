# Group Forum

## Purpose

Support focused group discussions with readable thread structure.

## User-Facing Surfaces

- `/groups/[groupId]/forum` thread list.
- `/groups/[groupId]/forum/[threadId]` full thread view.
- Closed-by-default Create Forum thread wizard.
- Reply bubble composer.
- Thread/post reaction buttons.

## Primary Code Areas

- `src/modules/group-forum`
- `src/components/groups/forum`
- `src/app/groups/[groupId]`

## Data Ownership

- `GroupForumThread`
- `GroupForumPost`
- `GroupForumThreadReaction`
- `GroupForumPostReaction`

## Core Workflows

- Threads collapsed by default.
- Click thread for full vertical view.
- End own thread.
- Moderators can delete ended threads.
- Reply with RTF, emoji, and photos when allowed.
- React to threads and replies.
- Link from group profile into the forum without adding irrelevant tabs.

## Access Rules

Members can post. Creator/moderators enforce rules.

## Integrations

Groups, notifications, media, moderation, reports.

## Current Design Notes

Forum UI should feel like chat bubbles inside a group, not a generic admin forum.

Photo reply validation exists through `mediaAssetId`; the actual group photo picker/upload UX belongs to the later group media module.

## Smoke Checklist

- Create Forum opens wizard.
- Ended thread hides from normal interaction.
- Group profile shows a single forum action card, not a pre-context tab bar.
- Thread cards are collapsed and clickable.
- Full thread view uses the whole vertical discussion surface.
- Reactions update without full-page reload patterns.
