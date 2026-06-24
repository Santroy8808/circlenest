# Live UX Efficiency Baseline - 2026-06-24

Target: https://theta-space.net  
Method: in-app browser, real clicks, live Railway/Neon/R2 production path. Localhost was not used for timing.

## Pass 1 Baseline

Key timings:

- Mike login completion: 1048 ms
- Mike nav to Messages: 2978 ms
- Mike nav to Mail: 3249 ms
- Mike nav to Browse People: 4321 ms
- Mike nav to Home: 3118 ms
- Home composer open: 359 ms
- Stream post create: 395 ms
- OP comment submit: 383 ms
- Jules login: 961 ms
- Jules nav to Messages: 2454 ms
- Jules open direct chat: 1950 ms
- Jules send chat: 388 ms
- Jules nav to Mail: 1925 ms
- Jules mail send retry: 4417 ms
- Admin login: 909 ms
- Admin nav to Admin Portal: 3567 ms
- Admin open Status Change wizard: 2701 ms
- Notification mark read: 340 ms

Confirmed findings:

- Messages showed duplicate direct-chat rows for the same peer.
- Admin Portal showed duplicate action cards for the same destinations.
- Page-to-page live transitions were commonly 2-4.5 seconds.

False positives / harness issues:

- Initial mail-recipient check missed visible Mike candidates because the test selector was too narrow.
- Some login/logout checks measured before the live navigation had completed.

## Fix Applied

Commit: `bf1d8d0 Deduplicate chat and admin action lists`

- Direct chat thread list now dedupes direct threads by peer user.
- Unread direct chat count dedupes by peer user.
- Existing direct-thread lookup prefers the newest matching two-participant thread.
- Admin Portal action cards are deduped by destination `href`.

Validation before push:

- `npm.cmd run lint`
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`

## Pass 2 Verification

Key timings:

- Mike login: 1089 ms
- Mike nav Home: 379 ms warm path
- Home composer open: 330 ms
- Jules login: 919 ms
- Jules nav Messages after direct click: 2948 ms
- Existing Michael direct chat rows, scoped to real thread list: 1
- Open deduped direct chat row: 1965 ms
- Send desktop chat: 372 ms
- Admin login: 928 ms
- Admin nav Admin Portal: 2723 ms
- Admin duplicate destination check: 0 duplicate `href` targets

Result:

- Duplicate direct-chat rows fixed in the actual thread list.
- Admin duplicate destinations fixed.
- Live page transitions still remain the main performance issue.

## Pass 3 Verification

Key timings:

- Mike login: 7267 ms
- Mike nav Home: 3331 ms
- Mike gallery image opens in-app: 4465 ms
- Mike nav Messages: 2115 ms
- Start direct chat search result for Jules: 812 ms
- Mike send direct chat to Jules through search-created chat: 729 ms
- Jules login recipient check: 6456 ms
- Jules nav Messages recipient check: 3037 ms
- Jules existing Mike chat row visible: 26 ms
- Jules open Mike chat recipient check: 300 ms
- Admin login: 6456 ms
- Admin nav Admin Portal: 2224 ms
- Admin duplicate destination check: 0 duplicate `href` targets
- Admin open Status Change wizard: 1973 ms

Result:

- Direct-chat search finds Jules.
- Clicking the Jules result opens a real composer.
- Sending from Mike posts immediately in the sender chat.
- Jules sees one Mike chat row and the sent message is present in the opened thread.
- Gallery images open in-app instead of a new browser tab.
- Admin Status Change wizard opens from its card.

## Remaining Baseline Concern

The remaining consistent issue is global live latency:

- Page transitions commonly measure 2-4.5 seconds.
- Login sometimes measures 5-7 seconds on live.
- Small client-side actions are usually fast once the page is loaded.

Next recommended optimization pass:

- Profile app-shell per-page work on live-equivalent data.
- Consolidate unread/count queries.
- Reduce blocking onboarding/settings/admin checks during ordinary page navigation.
- Avoid full server reload patterns where a client state update would suffice.
- Keep counts and badges useful, but do not let them block the primary page content.
