# Group Media Docs

## Purpose

Provide simple group photos and document sharing.

## User-Facing Surfaces

- Group photos gallery.
- Group documents list.
- Upload wizard.

## Primary Code Areas

- `src/modules/group-media-docs`
- `src/components/groups/media`

## Data Ownership

- future group media/document tables using `MediaAsset`.

## Core Workflows

- Upload by creator, moderator, or provider.
- Delete own/moderated uploads.
- Comment/headline photos.
- Enforce 40MB group asset cap.

## Access Rules

Only creator, moderators, or provider-flagged members upload.

## Integrations

Groups, media storage, comments, moderation.

## Current Design Notes

Keep this far simpler than My Pics. No heavy album-management UI.

## Smoke Checklist

- Non-provider member cannot upload.
- Storage cap blocks upload cleanly.

