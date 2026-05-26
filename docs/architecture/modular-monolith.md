# CircleNest Modular Monolith

CircleNest is structured as a modular monolith with strict domain boundaries:

- `auth`: login, signup, reset password, 2FA, session guards.
- `profile`: user profile fields, avatar/banner, bio, themes.
- `stream`: home stream read/write services and feed modes.
- `social-graph`: friendships, follows, requests, association categories.
- `groups`: group lifecycle, moderation roles, forum, events, photos, docs.
- `messages`: direct threads, inbox listing, unread tracking.
- `notifications`: mention/message/system/friend/group notifications.
- `media`: upload validation, storage abstraction, album linkage.
- `search`: user/group/post query services and ranking.

## Rules

1. Route handlers call module services, never Prisma directly in UI-heavy pages.
2. Shared code sits under `src/lib`.
3. Module services may use Prisma, but must return typed domain responses.
4. Feature flags gate unfinished modules for controlled cutover.
