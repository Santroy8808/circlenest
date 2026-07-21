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
- `DestructiveActionRequest` and `DestructiveActionStorageObject` preserve the deletion request, exact asset set, storage manifest, status, and audit history.
- `PlatformJob` runs and retries verified object removal.

## Core Workflows

- Direct browser upload to R2.
- Save DB record after upload.
- Recent-first gallery.
- Tags and albums added after upload.
- System date tags.
- Set an owned, ready My Pics asset as the exact requested avatar or banner target.
- Hide selected photos immediately after a confirmed deletion request, then remove and verify every public/private main and thumbnail object asynchronously.
- Show queued, running, failed, and completed deletion state; allow a failed/cancelled request to be retried with fresh DELETE-password confirmation.

## Implemented Slice

- R2 presigned PUT support in `src/lib/platform/r2`.
- Upload intent API at `/api/media/upload-intent`.
- Upload completion API at `/api/media/complete-upload`.
- `MediaCollection` and `MediaCollectionAsset` support albums, tags, and system date collections.
- `/profile/gallery` protected My Pics recent-first gallery.
- `/profile/gallery/upload` focused upload page with direct upload progress.
- Durable `gallery.media-delete.v1` jobs with an immutable deletion manifest, bounded retries, at most two delayed automatic recovery jobs, and a member-confirmed retry path.
- `DELETING` media state keeps a queued photo hidden and unusable until secure storage removal is verified.
- Storage deletion covers the public and private R2 buckets and verifies absence independently after each delete acknowledgement.
- Duplicate requests converge on the existing durable request instead of creating competing deletes.
- Database and service reference fences reject missing, non-ready, protected, or deleting media when Stream, ads, business articles, chat, mail, groups, Market, or Scientology records are written.
- Avatar/banner mutations use bounded JSON responses and verify the exact selected asset URL and requested target before reporting success.
- System-managed images are excluded from member search, selection, empty-state counts, and deletion.

## Access Rules

Users own their photo pool. Viewing and organizing My Pics is not behind a second secure-area password prompt. Destructive deletion requires the DELETE password at the service boundary.

Only owned `READY` photos may be selected or referenced. A photo still used by another live feature must be detached there before deletion can be queued. System-managed media can never be deleted through My Pics.

## Integrations

Profile avatar/banner, feed, chat, mail, groups, auditors, business.

## Current Design Notes

Avoid complex upload forms on the gallery page. Upload opens its own page on mobile and a large focused surface on desktop.

Deletion is intentionally asynchronous. The photo disappears from normal member views as soon as the request is accepted. The Gallery then shows `Deletion queued`, `Removing photos`, or `Action needed`; it never claims deletion completed until storage verification and database cleanup succeed.

## Operations

- Deploy the application and platform-job worker together.
- The worker must continuously process `gallery.media-delete.v1` and have delete plus verification access to both R2 buckets.
- If the worker is unavailable, affected photos remain safely hidden in `DELETING` and the durable request remains recoverable.
- Apply `20260721143000_gallery_media_deleting_state` before `20260721150000_media_asset_reference_fence`.

## Smoke Checklist

- Upload progress visible.
- New photo appears without refresh.
- Mobile upload page scrolls.
- Avatar and banner each apply only the selected owned asset and return a stable success or error message.
- A deletion request requires DELETE confirmation, hides the exact selected photos immediately, and displays durable progress.
- A completed worker run verifies every main/thumbnail object before removing database rows.
- A failed deletion displays a safe cause and can be retried after renewed DELETE confirmation.
- A referenced photo and a system-managed photo cannot be deleted.
- Gallery controls and metadata remain readable in light and dark themes at desktop, `390px`, and `320px`; no horizontal clipping occurs.
