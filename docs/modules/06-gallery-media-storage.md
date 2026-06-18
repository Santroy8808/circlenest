# Gallery Media Storage

## Purpose

Provide a simple, fast My Pics photo pool backed by Cloudflare R2.

## User-Facing Surfaces

- My Pics gallery.
- Upload page.
- Photo viewer.
- Avatar/banner actions.

## Primary Code Areas

- `src/modules/gallery-media-storage`
- `src/components/gallery`
- `src/app/profile/gallery`
- `src/lib/platform/r2`

## Data Ownership

- `MediaAsset`
- `MediaCollection`
- `MediaCollectionAsset`

## Core Workflows

- Direct browser upload to R2.
- Save DB record after upload.
- Recent-first gallery.
- Tags and albums added after upload.
- System date tags.

## Implemented Slice

- R2 presigned PUT support in `src/lib/platform/r2`.
- Upload intent API at `/api/media/upload-intent`.
- Upload completion API at `/api/media/complete-upload`.
- `MediaCollection` and `MediaCollectionAsset` support albums, tags, and system date collections.
- `/profile/gallery` protected My Pics recent-first gallery.
- `/profile/gallery/upload` focused upload page with direct upload progress.

## Access Rules

Users own their photo pool. Photos are not behind secure-area password prompt.

## Integrations

Profile avatar/banner, feed, chat, mail, groups, auditors, business.

## Current Design Notes

Avoid complex upload forms on the gallery page. Upload opens its own page on mobile and a large focused surface on desktop.

## Smoke Checklist

- Upload progress visible.
- New photo appears without refresh.
- Mobile upload page scrolls.
