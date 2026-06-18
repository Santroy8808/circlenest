# Feed Stream

## Purpose

Provide the main social experience: posts, comments, reactions, and meaningful updates.

## User-Facing Surfaces

- Home stream.
- Post detail.
- Composer.
- Comment/reply bubbles.

## Primary Code Areas

- `src/modules/feed-stream`
- `src/components/feed`
- `src/app/home`
- `src/app/posts`

## Data Ownership

- future post, comment, reaction, poll tables.

## Core Workflows

- Create post.
- Comment and reply without losing position.
- React to posts/comments/replies.
- Attach photos.
- Switch feed modes by tier.

## Access Rules

Free can post/comment within allowed limits. Tier policy controls advanced feed modes.

## Integrations

Social graph, notifications, media, groups, reports, moderation.

## Current Design Notes

Avoid engagement-only ranking. Prefer chronological and relationship-weighted controls.

## Smoke Checklist

- Comment stays in thread.
- No full-page reload after reaction.
- Mobile comments remain readable.

