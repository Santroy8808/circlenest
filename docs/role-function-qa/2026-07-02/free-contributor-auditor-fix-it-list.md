# Theta-Space Role Function QA Fix-It List

Run marker: `TS-ROLE-QA-20260702`
Date: 2026-07-02
Target: `https://theta-space.net` production
Scope: Free, Contributor, Auditor browser walkthroughs. Onboarding was intentionally ignored per instruction.

## Dev Fix Pass - 2026-07-02

Target: `http://localhost:3100` local development against PostgreSQL.

Fixes applied in dev:

- Feed post creation now returns a full `FeedPostView`, and the desktop/mobile clients insert the created post immediately instead of waiting on a full refresh.
- Feed comment creation now returns the updated post thread, and the client swaps that post into the current stream immediately.
- Feed refresh no longer wipes the current stream when a partial payload is returned.
- Messages now dedupe optimistic local messages against server-confirmed messages, preventing the double-message flash.
- Messages member search results are deduped by person ID.
- Clicking recent/direct chat cards opens the chat instead of navigating to the person's profile.
- Auditor tier policy now allows market listing/storefront creation with a six-listing/three-photo allowance.
- Group creation now returns a JSON-safe DTO instead of the raw Prisma group record, fixing the `BigInt` serialization crash.
- Feed comment auto-focus now uses a stable hook dependency, clearing the lint warning.

Local browser validation completed:

| Role | Tested Result |
| --- | --- |
| Free (`john`) | Created a stream post; opened the thread reply route; posted a comment; searched messages for Mike with one result; opened Mike chat; sent one message that rendered once immediately and remained once after server sync; created a group; created a group forum thread; created a market listing. |
| Contributor (`mike`) | Logged in after local onboarding bypass; created a stream post that appeared once immediately; opened market create page successfully. |
| Auditor (`jules`) | Logged in after local onboarding bypass; opened market create page successfully; created an auditor-owned market listing. |

Dev verification:

- `npm run typecheck`: pass.
- `npm run lint`: pass with no warnings after the feed hook fix.
- `npm run build`: pass after stopping the local dev server to release the Windows Prisma DLL lock.
- Local dev server restarted on `http://localhost:3100`.

Remaining fix-it items after this dev pass:

- Full visual sweep still needs a stable browser session; the in-app browser connection timed out during a broad multi-page loop after the core flows above had passed.
- Gallery upload discovery/background upload still needs a dedicated end-to-end browser pass.
- Broken image fallbacks/R2 local configuration still need separate media-focused validation; local logs still show missing R2 bucket configuration for some legacy image assets.
- Broader page navigation speed should be remeasured with a short per-page script instead of one long browser loop.

## Accounts Used

| Role | Browser | Login | Result |
| --- | --- | --- | --- |
| Free | Firefox | `qa-free-20260702@theta-space.local` | Login worked after Firefox retried `/home`; account was QA-created because existing Free credentials were not usable. |
| Contributor | Edge | `mike` | Login worked. |
| Auditor | Edge | `jules` | Login worked. |

QA-only Free account created:

- Username: `qa-free-20260702`
- Email: `qa-free-20260702@theta-space.local`
- Display name: `QA Free Alpha`
- Cleanup needed after QA is no longer needed.

## Coverage Summary

The sweep visited 32 pages per role and ran 7 workflow checks per role: stream post, comment/reply, market listing creation, group creation, people/profile navigation, messages/direct chat, and gallery upload.

Positive findings:

- Login worked for all three roles.
- `/admin` did not expose admin tools to Free, Contributor, or Auditor. All three were returned to `/home`.
- Stream post creation persisted server-side for all three roles.
- Main navigation is present on all tested roles.

Main blockers before human alpha:

- Navigation and rendering are slow and unstable across the app. RSC payload failures and React hydration errors appear repeatedly.
- Comment/reply does not open a usable thread input immediately.
- Messages search/start-chat/send flow did not produce a persisted chat message.
- Group creation did not persist.
- Market listing creation did not persist in this sweep, and Auditor receives incorrect tier copy.
- Gallery upload was not discoverable from the tested gallery route.
- Broken image elements still appear in user-facing areas.
- Auditor role does not expose a clear auditor-specific dashboard/workflow.

## Created Test Data Inventory

Confirmed in production DB:

| Type | ID | Created By | Status | Cleanup Needed |
| --- | --- | --- | --- | --- |
| FeedPost | `cmr3tty2l061pawm5li7ng9nq` | Free QA | Persisted | Yes |
| FeedPost | `cmr3th44n04xkawm5ggbpxubs` | Contributor/Mike | Persisted | Yes |
| FeedPost | `cmr3tl4zv05kkawm5frkdp8ju` | Auditor/Jules | Persisted | Yes |

Not persisted with this run marker:

- Market listings: none
- Groups: none
- Feed comments: none
- Chat messages: none

Raw artifacts:

- `docs/role-function-qa/2026-07-02/role-function-results.json`
- `docs/role-function-qa/2026-07-02/free-raw.json`
- `docs/role-function-qa/2026-07-02/contributor-raw.json`
- `docs/role-function-qa/2026-07-02/auditor-raw.json`
- `docs/role-function-qa/2026-07-02/screenshots/`

## Cross-Tier Matrix

| Created/Actioned By | Consumed/Viewed By | Feature | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- | --- |
| Contributor | Free | Stream post | Free can see Contributor post | Free saw Contributor test post in stream | Pass |
| Auditor | Free | Stream post | Free can see Auditor post if visibility permits | Free saw Auditor test post in stream | Pass |
| Free | Contributor/Auditor | Stream post | Other roles can see Free post if visibility permits | DB confirmed Free post, but immediate UI confirmation was unreliable | Partial |
| Contributor | Free | Listing | Contributor can create listing; Free can discover it | No listing persisted from this sweep | Fail |
| Free | Contributor | Listing | Free can create market listing | No listing persisted from this sweep | Fail |
| Contributor | Free | Group | Contributor can create group; Free can find/join | No group persisted | Fail |
| Free/Contributor/Auditor | Any | Comment/reply | Comment opens thread and posts reply | Input did not appear immediately; no comments persisted | Fail |
| Free/Contributor/Auditor | Any | Direct message | Search member, open chat, send message | No chat message persisted; search/start-chat flow failed | Fail |
| Auditor | Contributor/Free | Auditor workflow | Auditor sees auditor-specific tools | No clear auditor workflow/dashboard found | Fail |
| Free/Contributor/Auditor | Admin | `/admin` boundary | Non-admins cannot access admin tools | Redirected to `/home` | Pass |

## Fix-It List

### FQA-001 - Site navigation is slow and unstable

Severity: High
Affected roles: Free, Contributor, Auditor
Affected pages: Broadly across `/home`, profile, gallery, messages, mail, business, alerts, and other routes.

Steps:

1. Log in as any tested role.
2. Move through sidebar/top navigation pages.
3. Watch page load and console behavior.

Expected:

- Page content appears quickly.
- Client navigation does not hard fallback or flicker.
- No hydration/runtime console errors.

Actual:

- Many pages took 4-7 seconds to reach a usable snapshot.
- Console repeatedly logged `Failed to fetch RSC payload... Falling back to browser navigation`.
- React minified errors `#418` and `#425` appeared on feed/profile/mail/alerts.
- Firefox aborted the first `/home` navigation once with `NS_BINDING_ABORTED`, then succeeded on retry.

Evidence:

- `screenshots/free-login-home-landing.png`
- `screenshots/contributor-login-home-landing.png`
- `screenshots/auditor-login-home-landing.png`
- Raw console logs in `role-function-results.json`

User impact:

- The site feels slow and unreliable even when the server eventually returns content.
- This directly conflicts with the requested "appear fast first, sync second" behavior.

Recommended fix:

- Treat RSC fetch failures/hydration errors as a release blocker.
- Add route-level timing instrumentation.
- Find which client components are rendering different server/client markup.
- Add skeleton/cached page shells so navigation is instant even when data refresh is pending.

### FQA-002 - Stream post persists, but immediate UI confirmation is unreliable

Severity: High
Affected roles: Free, Contributor, Auditor
Affected page: `/home`

Steps:

1. Open `/home`.
2. Click `Communicate`.
3. Enter a test post.
4. Click the send glyph.

Expected:

- The post appears immediately in the feed, even if final sync happens after.
- The input clears and gives clear success/failure state.

Actual:

- DB confirmed all three role posts persisted.
- The immediate browser check often did not show the new post in the current role's feed without later navigation/refresh.

Confirmed DB IDs:

- Free: `cmr3tty2l061pawm5li7ng9nq`
- Contributor: `cmr3th44n04xkawm5ggbpxubs`
- Auditor: `cmr3tl4zv05kkawm5frkdp8ju`

Evidence:

- `screenshots/free-flow-home-post.png`
- DB verification output in terminal history and raw report artifacts.

Recommended fix:

- Add optimistic append or immediate revalidation for the feed after successful post submit.
- Keep one client-side pending item keyed by a temporary client ID so the later server copy replaces it instead of duplicating.

### FQA-003 - Comment/reply does not open a usable thread input immediately

Severity: High
Affected roles: Free, Contributor, Auditor
Affected page: `/home` and thread/comment flow

Steps:

1. Open `/home`.
2. Click the comment/chat bubble on a post.

Expected:

- The app navigates or expands to the thread.
- The target post/comment remains visible for orientation.
- A reply input is visible and focused immediately.

Actual:

- The click did not expose a usable comment/reply input in the sweep.
- No `FeedComment` rows with the run marker were persisted.

Evidence:

- `screenshots/free-flow-comment.png`
- `screenshots/contributor-flow-comment.png`
- `screenshots/auditor-flow-comment.png`

Recommended fix:

- Wire comment button to an explicit thread route or in-place thread expansion.
- Auto-focus the reply input only after layout settles to avoid flicker.
- Add a smoke test that asserts the input exists after clicking comment.

### FQA-004 - Messages search/start-chat/send flow does not reach a full result

Severity: High
Affected roles: Free, Contributor, Auditor
Affected page: `/messages`

Steps:

1. Open `/messages`.
2. Search for another member.
3. Click the result.
4. Type a message and send.

Expected:

- Search results override recent chats while typing.
- Clicking a result opens a direct chat, not a profile.
- Sending a message renders it immediately once and persists it once.

Actual:

- No `ChatMessage` rows with the run marker were persisted.
- Search/start-chat did not reliably open a usable chat composer.
- Duplicate-like search/card text was observed in results.
- The page still has a confusing split between recent chats and member search behavior.

Evidence:

- `screenshots/free-flow-messages.png`
- `screenshots/contributor-flow-messages.png`
- `screenshots/auditor-flow-messages.png`

Recommended fix:

- Merge recent chat and member search into one live search surface.
- Deduplicate results by user ID/thread ID.
- Clicking a member result should create/open the direct thread and place focus in the input.
- Use client-generated temporary message IDs to prevent duplicate optimistic/server messages.

### FQA-005 - Group creation does not persist or confirm

Severity: High
Affected roles: Free, Contributor, Auditor
Affected page: `/groups/create`

Steps:

1. Open `/groups/create`.
2. Fill available group fields.
3. Click create.

Expected:

- Group is created.
- User is redirected to the group or shown a clear validation error.

Actual:

- The page stayed on `/groups/create`.
- No `Group` rows with the run marker were found in production DB.
- The user receives no clear completion state.

Evidence:

- `screenshots/free-flow-group-create.png`
- `screenshots/contributor-flow-group-create.png`
- `screenshots/auditor-flow-group-create.png`

Recommended fix:

- Add route-level error display and form validation feedback.
- Log the API response in the browser-visible UI for failures.
- Add a server-side smoke test for group create.

### FQA-006 - Market listing creation did not persist; Auditor tier copy is wrong

Severity: High
Affected roles: Free, Contributor, Auditor
Affected page: `/market/create`

Steps:

1. Open `/market/create`.
2. Fill listing fields.
3. Submit.

Expected:

- Free and Contributor can create listings if tier permissions allow it.
- The user receives a success state or field-level validation.
- Auditor should either create listings or see correct role-specific gating copy.

Actual:

- No `MarketListing` rows with the run marker were found in production DB.
- Free/Contributor stayed on `/market/create` after submit attempt.
- Auditor saw: `Upgrade to Free to use this feature`, which is nonsensical because Free is lower than Auditor.

Evidence:

- `screenshots/free-flow-market-create.png`
- `screenshots/contributor-flow-market-create.png`
- `screenshots/auditor-flow-market-create.png`

Recommended fix:

- Verify submit handler and required field wiring.
- Show field validation inline when title/category/location/price are missing or invalid.
- Replace tier copy with role-aware text: "This account cannot create market listings" or "Switch to a personal/business/auditor profile that has listing permissions."

### FQA-007 - Gallery upload is not discoverable from the tested gallery route

Severity: High
Affected roles: Free, Contributor, Auditor
Affected page: `/profile/gallery`

Steps:

1. Open `/profile/gallery`.
2. Look for upload.
3. Try to open upload and attach a test PNG.

Expected:

- A clear upload control exists.
- File picker/input is available.
- Upload continues in background and later notifies completion.

Actual:

- The automated sweep found no visible `input[type=file]` after opening the gallery route.
- No upload flow could be completed from this route.

Evidence:

- `screenshots/free-flow-gallery-upload.png`
- `screenshots/contributor-flow-gallery-upload.png`
- `screenshots/auditor-flow-gallery-upload.png`

Recommended fix:

- Ensure the gallery has a visible, standard upload action for all tiers allowed to upload.
- Keep upload route and gallery route consistent.
- Add background upload state and completion notification.

### FQA-008 - Broken image elements still appear in user-facing pages

Severity: High
Affected roles: Free, Contributor, Auditor
Affected pages: People browse, gallery/profile areas, ad stream, market-related pages.

Steps:

1. Open People/Browse People or market/create.
2. Observe visible image areas.

Expected:

- All visible image containers either render an image, a stable placeholder, or no broken icon.

Actual:

- Visible broken image elements were detected in multiple role passes.
- The `TESTING` ad card image was visibly broken in several screenshots.

Evidence:

- `screenshots/free-flow-people-profile.png`
- `screenshots/contributor-flow-market-create.png`
- `screenshots/auditor-flow-market-create.png`

Recommended fix:

- Standardize `MediaAsset.thumbnailUrl` usage in card/list surfaces.
- Add fallback placeholder when URL is missing or image fails.
- Verify R2/Cloudflare cache URLs and CORS for image display.

### FQA-009 - Business/ad/event/writer features are visible but not usable

Severity: Medium
Affected roles: Free, Contributor, Auditor
Affected pages: `/business-center`, `/business-center/create-ad`, `/business-center/campaigns`, `/business-center/metrics`, `/ads`, `/events/create`, `/writers-corner`.

Expected:

- If a feature is in development, it should be clearly labeled and click-count logged.
- If it is not meant for a tier, it should be hidden or gated with correct copy.
- If it is visible, the page should be complete enough for the user's role.

Actual:

- Many visible routes show "This feature is not yet available."
- Contributor Business Center is visible but not usable.
- Auditor ad creation shows a fuller ad page, but the Auditor role does not have a clear explanation of what it can do.

Evidence:

- `screenshots/free-business-create-ad.png`
- `screenshots/contributor-business-center.png`
- `screenshots/auditor-business-create-ad.png`

Recommended fix:

- Decide feature visibility by tier capability map.
- Add click logging for not-yet-available features.
- Hide non-Free/non-current-tier controls if they only dead-end.

### FQA-010 - People/profile card click behavior is not reliable enough

Severity: Medium
Affected roles: Free, Contributor, Auditor
Affected page: `/people`

Steps:

1. Open `/people`.
2. Search for another member.
3. Click the avatar/name/card.

Expected:

- Avatar, handle, and display name navigate to the user's profile globally.

Actual:

- The sweep often remained on `/people` after click.
- A tooltip appeared ("View this profile") but the full profile did not reliably open from the card click.

Evidence:

- `screenshots/free-flow-people-profile.png`
- `screenshots/contributor-flow-people-profile.png`
- `screenshots/auditor-flow-people-profile.png`

Recommended fix:

- Make the avatar, display name, handle, and card primary area actual links to `/profile/{handle}`.
- Keep relationship buttons separate so they do not steal the card click area.

### FQA-011 - Layout still has squishing/overlap issues at desktop viewport

Severity: Medium
Affected roles: Free, Contributor, Auditor
Affected pages: Multiple, especially market/create and messages/business pages.

Expected:

- Main content, control panel, ad stream, and report button should not overlap or compress each other.

Actual:

- At 1440x900, the ad stream appears across the lower page area on several routes instead of staying as a clean right-side column.
- The report button can overlap content in lower-right areas.
- Button-border touching was detected repeatedly, especially segmented controls and sidebar group boundaries.

Evidence:

- `screenshots/free-flow-market-create.png`
- `screenshots/contributor-flow-market-create.png`
- `screenshots/free-flow-messages.png`

Recommended fix:

- Rework desktop app shell grid with explicit min/max columns and breakpoints.
- At narrower widths, move ad stream below content intentionally, not halfway through active forms.
- Add visual regression checks at 1440x900, 1366x768, and 1920x1080.

### FQA-012 - Auditor role does not expose a clear auditor workflow

Severity: Medium
Affected role: Auditor
Affected pages: `/home`, `/auditors`, `/market/create`, business/ad pages.

Expected:

- Auditor should have a clear auditor-specific dashboard, profile, listings, review, or auditing workflow.

Actual:

- Auditor lands in the ordinary member control panel.
- No obvious audit queue/review tools were found during the page sweep.
- Market create gating says "Upgrade to Free", which makes the tier model look broken.

Evidence:

- `screenshots/auditor-login-home-landing.png`
- `screenshots/auditor-auditors.png`
- `screenshots/auditor-flow-market-create.png`

Recommended fix:

- Define Auditor role entry points in navigation.
- Add role-specific copy and allowed actions.
- Hide irrelevant lower-tier upgrade language.

## Recommended Priority Before Human Alpha

Must fix before human alpha:

1. RSC/hydration/navigation instability.
2. Comment/reply input flow.
3. Messages search/start-chat/send flow.
4. Group creation persistence/feedback.
5. Market listing create persistence and tier gating copy.
6. Broken image rendering/fallbacks.

Should fix soon:

1. Gallery upload discovery/background flow.
2. People/profile click targets.
3. Business/ad placeholder visibility and click logging.
4. Auditor role workflow clarity.
5. Desktop grid/ad stream layout.

Nice to fix:

1. Button border spacing polish.
2. Tooltip consistency.
3. Cleaner empty states and validation text.

## Notes and Limits

- Destructive actions were not executed: delete, purge, password reset, payment/Stripe, report issue submission, logout-final-state testing, and external invites.
- The QA-only Free account and created feed posts should be cleaned up when no longer needed.
- This report focuses on functional/user-visible issues. Raw data contains additional low-level console and visual findings.

## Dev Fix Pass - 2026-07-02 Quality Hardening

Completed locally:

- Feed post/comment create now returns and inserts the saved post immediately, then refreshes in the background.
- Message sends now use optimistic replacement/deduping so the local message is replaced by the saved message instead of briefly showing duplicates.
- Message contact search is deduped by person ID, and clicking recent/direct chat cards opens chat instead of navigating to profile.
- Message image attachments now fall back to `/api/media/assets/{id}` and remain in the inline image renderer when public/thumbnail URLs are missing.
- Gallery has a direct Upload action in the main toolbar and empty state. It queues private gallery uploads in the background instead of forcing a page jump.
- Gallery background uploads now drain newly queued files during an active upload.
- Gallery thumbnails fall back to the media asset endpoint if a stale thumbnail/public URL fails.
- Media asset image fetch failures now return a themed SVG image placeholder instead of broken JSON in image contexts.
- Group creation returns a JSON-safe DTO instead of a raw Prisma record with BigInt fields.
- Auditor policy now allows market listings/storefront creation with bounded free-tier limits.

Verification completed:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `APP_BASE_URL=http://localhost:3100 npm run smoke:health` passed for `/health/live`, `/health/version`, and `/health/ready`.
- Local `/health/ready` reports DB healthy; R2 and Redis are expected degraded/unknown in this local dev environment when not configured.

Still needs browser/manual confirmation:

- Full role sweeps for Free, Contributor, and Auditor after the fix pass.
- Gallery file-picker upload from the browser, including background completion notification and thumbnail display.
- Desktop visual pass at 1366x768, 1440x900, and 1920x1080 for remaining layout squish/overlap.
- Group forum photo upload permissions and group storage purge controls.
- Auditor-specific navigation/workflow clarity beyond market/storefront capability.

Browser automation note:

- The in-app browser connection timed out while opening `http://localhost:3100/login` during this pass. Validation continued with build, lint/typecheck, health smoke, and targeted route readiness checks.

## Dev Fix Pass - 2026-07-02 Layout Follow-Up

Completed locally:

- People browse row cards are more compact, with tighter avatar/content/action sizing and better spacing between relationship buttons.
- Profile relationship actions were adjusted so `Friend me` and `Acquaintance` read like lightweight action links instead of heavy fuzzy button text.
- Desktop shell grid sizing now preserves the ad rail down to smaller desktop widths and gives the main content a stronger minimum width before the ad rail stacks.
- Free/Auditor tier policy remains aligned so Auditor can create bounded market/storefront content without upgrade-copy confusion.

Verification completed:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `APP_BASE_URL=http://localhost:3100 npm run smoke:health` passed for `/health/live`, `/health/version`, and `/health/ready`.

Still needs browser/manual confirmation:

- Visual confirmation of People browse, profile header relationship actions, gallery upload, messages, and desktop shell/ad rail at real browser sizes.
- End-to-end role sweeps as Free, Contributor, and Auditor in a live browser session.
