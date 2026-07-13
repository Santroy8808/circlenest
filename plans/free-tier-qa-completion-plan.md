# Free Tier QA Completion Plan

Status: COMPLETE
Canonical repo: `C:\Repos\Theta-Space-net\NewRepo`
Production repo: `S:\Workspace\circlenest`
Production URL: `https://theta-space.net`
Source matrix: `outputs/free-tier-readiness/theta-space-free-tier-qa.xlsx`
Working evidence: `tmp/free-tier-qa/`

## Objective

Execute every remaining Free-tier `Not Run` case with real production browser/API behavior, debug failures in one isolated module at a time, implement complete fixes, verify locally, deploy, and repeat the production test before closing the case.

The two authorized external inboxes may be used for delivery tests. Credentials must stay outside Git, logs, screenshots, workbook cells, and this plan.

## Cycle Protocol

Only load this header plus the current cycle section into working context.

1. Mark one cycle `IN PROGRESS` in this file.
2. Read only the current module's relevant QA rows, routes, services, components, permissions, and tests.
3. Execute the listed case against production with isolated QA users.
4. If it passes, record concise evidence and mark the case `PASS`.
5. If it fails, document actual behavior, diagnose only that feature, write a short focused implementation note, then fix it through schema, business logic, route, and UI phases as applicable.
6. Run targeted lint/type/tests, then full required verification when code changed.
7. Commit and push only the current cycle's source changes. Deploy and production-retest before marking the case closed.
8. Update `tmp/free-tier-qa/qa-results.json`, rebuild the QA workbook, update the checkpoint below, and end the cycle.
9. Begin the next cycle by rereading only its section and the checkpoint.

Do not delete user-owned production data. Destructive tests use seeded QA content/accounts only. Do not commit `tmp/`, credentials, browser state, or mailbox content.

## Checkpoint

- Current cycle: `COMPLETE`
- Current case: `COMPLETE`
- Last completed case: `FT-135`
- Passed or policy-retired this completion run: 69 / 69
- Failed or blocked: 0
- Last deployed commit: `91e125f`
- Next action: Free Tier launch review; the separate rapid-message stress case remains partially covered.

## Cycle 01 — Identity and email

Status: COMPLETED
Cases: 8

- [x] `FT-001` Invite-only signup rejects missing invite with clear guidance. Production verified 2026-07-12.
- [x] `FT-002` Valid one-time invite creates an account and cannot be reused. Production verified 2026-07-12.
- [x] `FT-003` Valid verification link verifies the email. SMTP, IMAP, UI, and database verified 2026-07-12.
- [x] `FT-004` Reused and altered verification tokens are rejected safely. Production verified 2026-07-12.
- [x] `FT-008` Existing-account password reset returns generic success and delivers email. Production verified 2026-07-12.
- [x] `FT-009` Unknown-account password reset does not disclose account existence. Production verified 2026-07-12.
- [x] `FT-011` Terms acceptance sends the branded PDF email and creates an audit record. PDF rendering defect fixed in `aeffa33`; SMTP, IMAP, PDF hash/text/layout, acceptance, and audit verified 2026-07-12.
- [x] `FT-012` Password reset revokes an existing session and invalidates the old password. Production verified 2026-07-12.

Evidence requirements: SMTP/IMAP delivery, message headers, PDF attachment readability, invite consumption, verification state, reset behavior, session rejection, and non-disclosing UI copy. Use only QA accounts plus the two authorized external inboxes.

### FT-011 focused implementation note

- Observed defect: the production PDF is readable, but its first-page title begins with an unsupported black-square glyph.
- Scope: add a deterministic ReportLab generator, regenerate only `public/legal/theta-space-terms-of-service-2026-07-10.pdf`, keep the existing version/path/acceptance contract unchanged.
- Verification: compare downloaded and emailed hashes; extract all legal text; render and inspect every page; lint/type/build; deploy; repeat acceptance with a fresh QA account before closing FT-011.

## Cycle 02 — Shell

Status: COMPLETE
Cases: 4

- [x] `FT-015` Cross-user unread badges reflect messages and available notifications without hidden Mail noise. Production verified 2026-07-12.
- [x] `FT-018` Keyboard-only navigation works with visible focus. Production verified 2026-07-12.
- [x] `FT-019` Long pages and nested panels scroll without visible scrollbar tracks. Production verified 2026-07-12.
- [x] `FT-020` Icon tooltips are readable and not clipped. Production verified 2026-07-12.

## Cycle 03 — Profile

Status: COMPLETE
Cases: 8

- [x] `FT-023` Edit display name, introduction, and city; verify persistence and discovery. Production verified 2026-07-12.
- [x] `FT-024` Set an owned gallery image as personal avatar. Production verified 2026-07-12.
- [x] `FT-025` Set an owned gallery image as personal banner. Fixed hidden success feedback and production verified 2026-07-12.
- [x] `FT-026` Create a text post on the user's profile. Cross-user production verified 2026-07-12.
- [x] `FT-027` Create an image post on the user's profile. Cross-user production verified 2026-07-12.
- [x] `FT-028` Restrict profile visibility and verify cross-user enforcement. Production verified and restored 2026-07-12.
- [x] `FT-029` Switch between personal and business actors across shell and content. Production verified and personal actor restored 2026-07-12.
- [x] `FT-030` Set a business-owned gallery asset as the business avatar. Production verified and personal actor restored 2026-07-12.

## Cycle 04 — People and trust

Status: COMPLETE
Cases: 6

- [x] `FT-035` Decline a friend request without creating a relationship. Cross-user production verified 2026-07-12.
- [x] `FT-036` Unfriend and verify removal for both users. Added missing UI; cross-user production verified and friendship restored 2026-07-12.
- [x] `FT-038` Send and accept a Sibling family relationship. Cross-user production verified 2026-07-12.
- [x] `FT-040` Block a QA user and enforce isolation. Cross-user production verified 2026-07-12.
- [x] `FT-041` Unblock and restore allowed interactions. Fixed API contract; cross-user production verified 2026-07-12.
- [x] `FT-042` Submit one report and show truthful confirmation. Production verified 2026-07-12.

## Cycle 05 — Stream

Status: COMPLETE
Cases: 9

- [x] `FT-044` Members-only text post visibility. Fixed viewer policy and cross-user production verified 2026-07-12.
- [x] `FT-047` Nested reply to another user's comment. Three-user production verified 2026-07-12.
- [x] `FT-049` Add and remove a comment reaction. Added toggle removal and production verified 2026-07-12.
- [x] `FT-050` Share another member's post. Fixed echo composer population and cross-user production verified 2026-07-12.
- [x] `FT-051` Author deletes an ordinary post. Added missing UI and cross-user production verified 2026-07-12.
- [x] `FT-052` Non-author cannot delete another user's post. UI and forged-request production verified 2026-07-12.
- [x] `FT-053` Dismiss a feed item and preserve dismissal after refresh. Per-user production verified 2026-07-12.
- [x] `FT-054` Create an allowed profile-targeted post. Cross-user production verified 2026-07-12.
- [x] `FT-055` Content visibility changes correctly across a block. Cross-user production verified and block removed 2026-07-12.

## Cycle 06 — Messages

Status: COMPLETE
Cases: 3

- [x] `FT-060` Three-user group conversation. Three-user production verified 2026-07-12.
- [x] `FT-062` Blocked messaging is denied. UI discovery and forged-request production verified; block removed 2026-07-12.
- [x] `FT-063` Another thread's private attachment URL is denied. Participant and outsider production verified 2026-07-12.

## Cycle 07 — Groups

Status: COMPLETE
Cases: 9

- [x] `FT-070` Restricted-group join request and owner approval. Cross-user production verified 2026-07-12.
- [x] `FT-071` Each member creates a group post. Three-user production verified 2026-07-12.
- [x] `FT-072` Group image post. Cross-user production verified 2026-07-12.
- [x] `FT-073` Group comments and replies. Added nested reply UI and three-user production verified 2026-07-12.
- [x] `FT-075` Group media upload, viewing, comment, and deletion. Cross-user production verified 2026-07-12.
- [x] `FT-076` Owner removes seeded QA member content. Added delete confirmation and cross-user production verified 2026-07-12.
- [x] `FT-077` Member leaves a group. C left successfully, lost forum access, and disappeared from the owner roster in production 2026-07-12.
- [x] `FT-078` Non-owner moderation attempt is denied. Member UI hid management and forged remove/role requests were denied without changing ownership in production 2026-07-12.
- [x] `FT-079` Non-member cannot open private group/forum media URLs. Fixed public-group forum attachments inheriting public group-asset access; C sees the public group page but receives 404 for its forum and forum image in production 2026-07-12.

## Cycle 08 — Gallery

Status: COMPLETE
Cases: 14

- [x] `FT-083` Background upload survives navigation. Delayed completion stayed active across client navigation, completed with 200, showed the global toast, and persisted the asset in production 2026-07-12.
- [x] `FT-084` Add, replace, and filter tags. Add and replace returned 200, pills updated, and gallery search isolated the tagged asset in production 2026-07-12.
- [x] `FT-085` Change image visibility among private, members, and public. Owner saves returned 200 and delivery enforced private 404, member-only 200/anonymous 401, and public anonymous 200 in production 2026-07-12.
- [x] `FT-087` Comments-disabled image rejects a new comment.
- [x] `FT-088` Reply to an image comment.
- [x] `FT-089` Add and remove an image-comment reaction.
- [x] `FT-090` Multiple users react to a public image.
- [x] `FT-092` Set an owned image as avatar.
- [x] `FT-093` Set an owned image as banner.
- [x] `FT-094` Retired from Free Tier: business identities are not available to Free members.
- [x] `FT-095` Open and close image information controls.
- [x] `FT-097` Owner deletes a seeded QA image.
- [x] `FT-098` Private media URL rejects another user.
- [x] `FT-099` Large landscape image and long thread have no overflow defect.

## Cycle 09 — Jobs

Status: COMPLETE
Cases: 1

- [x] `FT-115` Retired from Free Tier: job publishing is not a Free Tier capability.

## Cycle 10 — Business

Status: COMPLETE
Cases: 2

- [x] `FT-117` Retired from Free Tier: business identity switching is hidden and unavailable.
- [x] `FT-122` Retired from Free Tier: storefronts are not a Free Tier capability.

## Cycle 11 — Notifications

Status: COMPLETE
Cases: 2

- [x] `FT-123` Comment/reply notification opens the correct target.
- [x] `FT-127` Notification or announcement dismissal persists.

## Cycle 12 — Search privacy

Status: COMPLETE
Cases: 1

- [x] `FT-129` Private and blocked content never appears in search.

## Cycle 13 — Feedback

Status: COMPLETE
Cases: 1

- [x] `FT-131` Submit a feedback ticket and verify persistence/admin visibility.

## Cycle 14 — Accessibility

Status: COMPLETE
Cases: 1

- [x] `FT-135` Review core pages in dark and light themes for contrast, focus, clipping, and readable state colors.

## Final Gate

- [x] All 69 cases have a production result and evidence.
- [x] No unresolved P0/P1 defect remains.
- [x] All changed code passes workspace verification, lint, typecheck, and build.
- [x] Production health and deployed Git revision are verified.
- [x] QA workbook is rebuilt, formula-scanned, rendered, and visually checked.
- [x] Final summary distinguishes passed, fixed, blocked, partial, and intentionally destructive cases.
