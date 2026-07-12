# Group Media Docs

## Purpose

Provide simple group photos and document sharing without turning group files into an album-management console.

## User-Facing Surfaces

- Group media page at `/groups/[groupId]/media`.
- Photos/docs toggle.
- Upload panel opened only when an allowed uploader clicks `Upload`.
- Comments on individual files.

## Primary Code Areas

- `src/modules/group-media-docs`
- `src/components/groups/media`
- `src/app/groups/[groupId]/media`
- `src/app/api/groups/[groupId]/media`

## Data Ownership

- `GroupAsset` owns the group-specific file record.
- `GroupAssetComment` owns comments on group photos/docs.
- `MediaAsset` remains the storage-backed file record.
- Group files are separate from personal `My Pics`.

## Core Workflows

- Group photo libraries with at least two images can switch between Grid and Carousel views.
- Carousel view advances every 3 seconds and supports manual left/right, dot, keyboard, and swipe navigation.

- View a simple group photo grid.
- View a simple group documents list.
- Upload photos or docs directly to R2, then complete the DB record.
- Add optional headline/description.
- Comment on an asset.
- Delete own uploads or moderated uploads.
- Enforce the group-level storage cap before presign and again on completion.

## Access Rules

- Public groups are viewable by members and logged-in users.
- Private groups are viewable by members/admins.
- Upload is limited to Admin, group owner, group moderator, or provider-flagged group member.
- Comments require group membership or Admin.
- Deleting is limited to uploader, group owner, group moderator, or Admin.

## Integrations

- Groups.
- Cloudflare R2 direct upload.
- `MediaAsset`.
- Diagnostics.

## Current Design Notes

Keep this far simpler than My Pics. No albums, no tags, no bulk organizer, no always-visible upload form.

## Smoke Checklist

- Non-provider member cannot upload.
- Owner/moderator/provider can open upload panel.
- Photo upload supports JPG, PNG, GIF, and WEBP up to 10MB each.
- Document upload supports PDF, Word, Excel, PowerPoint, and text up to 20MB each.
- Storage cap blocks upload cleanly.
- Group profile links to Media & Docs.
- Comments persist on assets.
