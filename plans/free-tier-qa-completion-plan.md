# Free Tier QA Completion Plan

Status: ACTIVE
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

- Current cycle: `03-profile`
- Current case: `FT-023`
- Last completed case: `FT-020`
- Passed this completion run: 12 / 69
- Failed or blocked: 0
- Last deployed commit: `aeffa33`
- Next action: edit the QA profile identity fields, then verify persistence and cross-user discovery.

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

Status: IN PROGRESS
Cases: 8

- [ ] `FT-023` Edit display name, introduction, and city; verify persistence and discovery.
- [ ] `FT-024` Set an owned gallery image as personal avatar.
- [ ] `FT-025` Set an owned gallery image as personal banner.
- [ ] `FT-026` Create a text post on the user's profile.
- [ ] `FT-027` Create an image post on the user's profile.
- [ ] `FT-028` Restrict profile visibility and verify cross-user enforcement.
- [ ] `FT-029` Switch between personal and business actors across shell and content.
- [ ] `FT-030` Set a business-owned gallery asset as the business avatar.

## Cycle 04 — People and trust

Status: PENDING
Cases: 6

- [ ] `FT-035` Decline a friend request without creating a relationship.
- [ ] `FT-036` Unfriend and verify removal for both users.
- [ ] `FT-038` Send and accept a Sibling family relationship.
- [ ] `FT-040` Block a QA user and enforce isolation.
- [ ] `FT-041` Unblock and restore allowed interactions.
- [ ] `FT-042` Submit one report and show truthful confirmation.

## Cycle 05 — Stream

Status: PENDING
Cases: 9

- [ ] `FT-044` Members-only text post visibility.
- [ ] `FT-047` Nested reply to another user's comment.
- [ ] `FT-049` Add and remove a comment reaction.
- [ ] `FT-050` Share another member's post.
- [ ] `FT-051` Author deletes an ordinary post.
- [ ] `FT-052` Non-author cannot delete another user's post.
- [ ] `FT-053` Dismiss a feed item and preserve dismissal after refresh.
- [ ] `FT-054` Create an allowed profile-targeted post.
- [ ] `FT-055` Content visibility changes correctly across a block.

## Cycle 06 — Messages

Status: PENDING
Cases: 3

- [ ] `FT-060` Three-user group conversation.
- [ ] `FT-062` Blocked messaging is denied.
- [ ] `FT-063` Another thread's private attachment URL is denied.

## Cycle 07 — Groups

Status: PENDING
Cases: 9

- [ ] `FT-070` Restricted-group join request and owner approval.
- [ ] `FT-071` Each member creates a group post.
- [ ] `FT-072` Group image post.
- [ ] `FT-073` Group comments and replies.
- [ ] `FT-075` Group media upload, viewing, comment, and deletion.
- [ ] `FT-076` Owner removes seeded QA member content.
- [ ] `FT-077` Member leaves a group.
- [ ] `FT-078` Non-owner moderation attempt is denied.
- [ ] `FT-079` Non-member cannot open private group/media URLs.

## Cycle 08 — Gallery

Status: PENDING
Cases: 14

- [ ] `FT-083` Background upload survives navigation.
- [ ] `FT-084` Add, replace, and filter tags.
- [ ] `FT-085` Change image visibility among private, members, and public.
- [ ] `FT-087` Comments-disabled image rejects a new comment.
- [ ] `FT-088` Reply to an image comment.
- [ ] `FT-089` Add and remove an image-comment reaction.
- [ ] `FT-090` Multiple users react to a public image.
- [ ] `FT-092` Set an owned image as avatar.
- [ ] `FT-093` Set an owned image as banner.
- [ ] `FT-094` Business-owned upload and avatar/banner assignment.
- [ ] `FT-095` Open and close image information controls.
- [ ] `FT-097` Owner deletes a seeded QA image.
- [ ] `FT-098` Private media URL rejects another user.
- [ ] `FT-099` Large landscape image and long thread have no overflow defect.

## Cycle 09 — Jobs

Status: PENDING
Cases: 1

- [ ] `FT-115` Another user cannot edit a job listing.

## Cycle 10 — Business

Status: PENDING
Cases: 2

- [ ] `FT-117` Business actor switching is consistent.
- [ ] `FT-122` Cross-user storefront inquiry reaches the owner.

## Cycle 11 — Notifications

Status: PENDING
Cases: 2

- [ ] `FT-123` Comment/reply notification opens the correct target.
- [ ] `FT-127` Notification or announcement dismissal persists.

## Cycle 12 — Search privacy

Status: PENDING
Cases: 1

- [ ] `FT-129` Private and blocked content never appears in search.

## Cycle 13 — Feedback

Status: PENDING
Cases: 1

- [ ] `FT-131` Submit a feedback ticket and verify persistence/admin visibility.

## Cycle 14 — Accessibility

Status: PENDING
Cases: 1

- [ ] `FT-135` Review core pages in dark and light themes for contrast, focus, clipping, and readable state colors.

## Final Gate

- [ ] All 69 cases have a production result and evidence.
- [ ] No unresolved P0/P1 defect remains.
- [ ] All changed code passes workspace verification, lint, typecheck, and build.
- [ ] Production health and deployed Git revision are verified.
- [ ] QA workbook is rebuilt, formula-scanned, rendered, and visually checked.
- [ ] Final summary distinguishes passed, fixed, blocked, partial, and intentionally destructive cases.
