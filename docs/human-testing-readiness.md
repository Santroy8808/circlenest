# Theta-Space Human Testing Readiness

## Current Local Target

- Local app: `http://localhost:3100`
- Server mode prepared for testing: production build via `npm run build` and `npm run start -- --hostname 0.0.0.0 --port 3100`
- Environment file: `.env.local`
- R2 local backup created before edits: `.env.local.backup-20260702-155554`

## Pre-Test Gate

Run these before inviting a human tester:

```powershell
npm run env:check
npm run typecheck
npm run lint
npm run build
$env:APP_BASE_URL='http://localhost:3100'; npm run smoke:health
npm run smoke:r2
```

The test can proceed only if:

- Environment validation passes.
- Build passes.
- `/health/live`, `/health/version`, and `/health/ready` pass.
- `/health/ready` reports Postgres healthy.
- `/health/ready` reports Cloudflare R2 healthy.
- `npm run smoke:r2` can create a presigned upload, upload a tiny image, verify it with R2 metadata, and delete it.

## R2 Status For Testing

- R2 credentials and bucket access are connected locally.
- Direct presigned R2 upload is validated by `npm run smoke:r2`.
- `CLOUDFLARE_R2_PUBLIC_BASE_URL` must be configured on the Windows production server with the public R2/CDN URL.
- Most media views now fall back to `/api/media/assets/{id}` when no public URL exists.
- Resume upload still depends on a public URL unless the resume schema is extended to store a media asset id.

## Human Test Order

1. Login
   - Confirm login with handle.
   - Confirm login with email.
   - Confirm failed login shows a clear error without a broken page.

2. Stream
   - Create a text post.
   - Create a post with an image.
   - Confirm the image renders in the feed without a manual link click.
   - React with triangle, love, laugh, shock, and dislike.
   - Confirm only public reactions show as counts.
   - Open comments, add a comment, and verify the thread lands at the reply area.

3. Gallery
   - Upload several images.
   - Confirm thumbnails render quickly.
   - Tag selected images.
   - Remove a tag.
   - Search by filename, tag, comment, and date range.
   - Delete one image and then delete a multi-selection.

4. Messages
   - Start a direct chat from search.
   - Send text.
   - Attach an image.
   - Confirm the image renders inline in the message stream for sender and recipient.
   - Start a group chat and confirm duplicate people cannot be selected.

5. Mail
   - Open inbox and sent mail.
   - Send a mail message.
   - Attach an image and confirm the layout does not clip columns.

6. People And Profiles
   - Browse people.
   - Search people.
   - Send friend, family, and acquaintance requests.
   - Confirm names, handles, and avatars navigate to profiles.
   - Confirm profile stream shows that profile's posts.

7. Groups
   - Create a group.
   - Create a thread.
   - Post text and image content in the thread.
   - Confirm group media storage rules are enforced.

8. Market And Business Center
   - Create a market listing with photos.
   - Create an ad draft or campaign path.
   - Confirm available ad destinations are owned by the logged-in account only.

9. Notifications And Alerts
   - Confirm friend/family/acquaintance requests appear as notifications, not alerts.
   - Confirm alerts are platform/system notices.
   - Select and hide notifications.

## Stop Conditions

Stop testing and file a fix item if any of these occur:

- Page navigation shows a long blank loading state after warm-up.
- Images render as links instead of inline media.
- Upload completes but the media does not render.
- A card, button, text box, nav item, or report button overlaps another control.
- A button border touches another button border.
- Any user-facing action appears successful but does not persist after refresh.
