# Route And API Map

## Implemented

- `/` - platform dashboard and module launch surface.
- `/health` - module health and environment readiness page.
- `/login`, `/signup`, `/reset-password`, `/verify-email` - auth surfaces.
- `/home` - protected app smoke-test home.
- `/feedback/new` - global issue ticket creation.
- `/membership` - tier matrix and policy comparison.
- `/profile`, `/profile/[username]`, `/profile/edit` - member profile identity surfaces.
- `/friends` - visual friends grid.
- `/profile/scientology` - protected My Scientology profile surface.
- `/profile/gallery`, `/profile/gallery/upload` - protected My Pics gallery and upload flow.
- `/notifications`, `/alerts` - protected notification and alert inboxes.
- `/api/auth/*` - credentials auth, signup, reset, verification, session revocation.
- `/api/feedback/tickets` - feedback ticket creation.
- `/api/membership-policy/matrix` - public tier matrix.
- `/api/membership-policy/evaluate` - authenticated feature evaluation.
- `/api/profile` - authenticated profile updates.
- `/api/profile/scientology` - authenticated My Scientology updates.
- `/api/media/upload-intent`, `/api/media/complete-upload` - direct R2 upload lifecycle.
- `/api/feed/posts`, `/api/feed/comments`, `/api/feed/reactions/post`, `/api/feed/reactions/comment` - feed stream actions.
- `/api/social-graph/relationships` - create/remove relationship tags.
- `/api/notifications/read`, `/api/alerts/read` - mark inbox items read.

## Planned

- `/posts/[postId]`
- `/groups`, `/groups/[groupId]`
- `/messages`, `/mail`
- `/production-zone`, `/market`, `/jobs`, `/auditors`, `/events`, `/fundraisers`
- `/admin`, `/settings`
- `/api/*` module-owned route handlers after each module lands.
