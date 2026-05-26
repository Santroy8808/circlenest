# Module Layout

- `auth`
- `profile`
- `stream`
- `social-graph`
- `groups`
- `messages`
- `notifications`
- `media`
- `search`

Each module should expose:

1. Service functions (`*.service.ts`) for domain logic.
2. DTO and validation types where needed.
3. No direct UI coupling.
