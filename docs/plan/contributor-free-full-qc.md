# Free and Contributor tier visibility and full-QC plan

Status: complete (2026-07-15)

This is the reference checklist for tier-boundary work and the user-level QC pass. A feature that a member cannot use must be absent from the shell, Tools/Production Zone, and direct routes; it must not merely render an upgrade gate.

## Capability boundary

| Area | Free | Contributor |
| --- | --- | --- |
| Stream, posts, comments, reactions, replies, messages, groups | Available | Available |
| Personal gallery and image comments | Available; 200 MB personal storage | Available; 2 GB personal storage |
| Market | Browse and create/edit personal listings; 3 listings per 14 days and 3 photos per listing | Browse and create/edit listings; 6 listings per 14 days and 3 photos per listing |
| Jobs | Browse and create/edit personal job listings | Hidden; not a Contributor feature |
| Auditor Directory | Browse/search | Browse/search |
| Writers Corner | Hidden | Available |
| Business Center, storefronts, business identity switching | Hidden | Hidden |
| Events, Fundraisers, general ads | Hidden (Events displays “Not yet available” where appropriate) | Hidden |
| Create an auditor profile | Hidden and marked Coming Soon where surfaced | Hidden and marked Coming Soon where surfaced |
| Membership upgrade choices | Hidden; membership shows only the current tier | Hidden; membership shows only the current tier |

Contributor has one deliberate exception to the general-ad boundary: the approved Market-only promotion flow is available at its direct route, but it is not placed in the Contributor navigation or Production Zone. The create wizard forces a Market listing destination; storefront, article, general, and fundraiser promotion choices remain unavailable.

The authoritative feature flags and limits remain in `src/modules/membership/membership-policy.ts` and the policy documentation in `docs/modules/03-membership-policy.md`.

## Defects fixed in this pass

1. Removed the stale `/features/unavailable` upgrade-gate route.
2. Enforced Writers Corner access at the service boundary, including manuscript lists/details, chapter details, subscriptions, and the mobile writers endpoint. A Free request receives the same not-found response as an unavailable manuscript.
3. Removed the accidental Business Center exposure caused by the Free `jobs.createListing` flag in both the app shell and Production Zone. Free members still retain the intended personal job-listing capability, but no business tools appear.
4. Confirmed the tier policy at runtime: Free has 200 MB storage, 3 listings per 14 days, and 3 photos per listing; Contributor has 2 GB storage, 6 listings per 14 days, and 3 photos per listing. Contributor retains Writers Corner and Market-only promotion, but not Business Center, Jobs, Events, Fundraisers, general ads, or auditor-profile creation.

## QC evidence to retain

- Free account `free001` completed the Terms attestation (legal name, account email, checkbox, Terms page/PDF links), dismissed the first-login welcome, and was checked against the full member shell.
- Contributor account `mike` was checked against allowed and restricted routes. The route sweep records heading, control count, horizontal overflow, and clipped controls.
- Light and dark mode controls were inspected; both modes kept readable control text and no horizontal overflow.
- Stream tabs Latest, Friends, Groups, and Pics were selected and verified.
- A QA manuscript, **The Lantern Beyond Winter**, was created with three requested chapters of exactly 500 words each. A fourth 500-word chapter was created after another Contributor subscribed with notifications enabled; the subscriber notification was verified with a chapter link.
- The QA manuscript, subscription, and generated notification were removed with the required `DELETE` confirmation guard; post-cleanup counts were zero for the named manuscript and notification.
- Allowed-route sweeps returned no horizontal overflow or right-edge clipping at the desktop test viewport. Restricted Contributor routes returned a generic not-found response rather than an upgrade gate. Free route checks likewise hid Writers Corner, Business Center, Events, Fundraisers, auditor-profile creation, and ad-manager routes.

## Completed run order

1. Completed the Contributor shell, Tools, Production Zone, Writers Corner, Market, Groups, Gallery, Comm Center, profile, settings, and restricted-route sweep.
2. Completed the Free shell and allowed-route sweep, including Market and Jobs controls; no business or upgrade-only controls appeared.
3. Exercised representative available workflows, including the three-chapter manuscript, subscription, and notification path.
4. Inspected representative light/dark layouts for borders, clipping, contrast, and horizontal overflow.
5. Removed only the named QA manuscript/subscription/notification records and verified no QA records remain.
6. Typecheck, lint, production build, and diff validation all pass; this pass does not deploy or push.

## Acceptance criteria

- No restricted feature is discoverable in a tier's shell, Tools/Production Zone, or direct route.
- Every available route has usable controls, no horizontal overflow, and no clipped primary controls at the tested viewport.
- The manuscript subscription flow creates a notification for a new chapter and the notification links to the chapter.
- Documentation/manual wording matches the feature flags and limits.
- Typecheck, lint, and build pass.
