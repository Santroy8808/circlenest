# Conduct Reporting, Commendations, and Communication Review

Status: implementation reference
Owner: Platform Management
Safe initial mode: manual reporting enabled, commendations enabled, disputes enabled, human review enabled, automated scanner in shadow mode, automated reports/warnings/restrictions disabled.

## Purpose

This system gives members a clear way to report or commend public interactions, gives moderators an auditable dispute workflow, and gives administrators a controlled communication-review process that can be run manually, automatically, or on a schedule.

The system evaluates conduct in context. Keywords can identify candidates for review, but a keyword alone never creates a report or restriction. Private communications are outside the review system.

## Non-negotiable privacy boundary

Eligible sources:

- Main member stream posts and their comments/replies.
- Group forum topics and their replies.
- Group picture comments when the picture is visible to the group.
- Statements entered directly into an open conduct dispute.

Excluded sources:

- Direct messages and message history.
- Group direct-message threads.
- Internal mail/inbox messages.
- Drafts and private profile/gallery content.
- Deleted content, except an immutable evidence snapshot already attached to an existing incident.

The scanner must use an allowlist of eligible Prisma models. It must never query `ChatThread`, `ChatMessage`, `EncryptedChatMessage`, `MailThread`, `MailMessage`, or their content tables. Tests must fail if an excluded model is introduced into scanner source adapters.

## Member functions

### Report

Eligible posts, comments, forum topics, forum replies, and group-picture comments expose a Report action. A member selects a reason, adds optional context, reviews the exact item being reported, and confirms. The system creates:

- An immutable incident reference.
- A report record associated with the account whose content was reported.
- A timestamped evidence snapshot and hash.
- An append-only history event.
- A notification to the reporter and to the responsible moderation queue.

Submitting a report does not prove misconduct. Duplicate reports of the same content are joined to the same incident while preserving each reporter's submission.

### Commend

The same eligible content exposes Commend. A member can select a category and add an optional note. Commendations are stored in the recipient's Reports and Commendations folder and create a notification. A member cannot commend their own content or commend the same item more than once.

### Reports and Commendations folder

Each account has a private folder containing reports concerning that account, commendations received, current dispute status, and active pairwise restrictions. Reporters see the status of their own submissions but not confidential moderator notes. Group moderators see incidents from groups they moderate. Platform admins see all incidents.

### Disputes

A reported member can dispute a report. Participants can add statements and link eligible public/group content. A dispute is never closed merely because time elapsed. Resolution requires the required participants to mark it resolved, or a moderator/admin to use an explicit override with a recorded reason. Every change is appended to the incident history.

### Pairwise communication restrictions

A restriction applies only between the two named accounts. It blocks new direct conversations between them and direct interactions such as replies, comments, and mentions aimed at the other account. It does not expose or inspect existing private messages. Available periods are 3, 7, 14, or 30 days. Repeated verified conflict may escalate the period; a conflict-free decay period lowers future escalation. Server-side checks are authoritative.

## Moderation ownership and permissions

- Main stream incidents: platform admins and designated platform moderators.
- Group forum and group-picture incidents: group owner/moderators plus platform admins.
- Reporter: may view their submission and public status changes.
- Reported account: may view the report/evidence allowed to them, open a dispute, and participate in resolution.
- Other members: no access.

Evidence snapshots are immutable. Incident/report/dispute status changes are recorded as append-only events. Human-facing references use stable prefixes (`INC-`, `RPT-`, `COM-`, `DSP-`, `RUN-`).

## Communication-review methodology

The review is a candidate-and-context pipeline:

1. Query only eligible content created or updated after the durable cursor.
2. Apply inexpensive local candidate detection and rate/volume limits.
3. Assemble bounded conversational context from the same public/group thread.
4. Remove nonessential personal data and treat all content as untrusted input.
5. Ask the configured analysis provider for strict structured output when a provider is enabled.
6. Validate the result against the server schema and policy version.
7. Deduplicate by a stable fingerprint.
8. Place candidates in the human review queue.
9. Create no member-facing action unless the configured action switch permits it.
10. Advance the cursor only after durable results are stored.

Candidate terms are routing signals, not findings. Quoting another person, discussing policy, satire, attempts at de-escalation, and educational use all require context. Model output is advisory and cannot change permissions, read excluded sources, or issue a restriction directly.

## Admin operating modes

Platform Management exposes a Communication Review panel.

### Manual

An admin chooses a time window and optionally a group, then runs a dry run or a real shadow review. The request is queued and may be monitored from the run history. Manual runs use the same lock, cursor, limits, and deduplication rules as scheduled runs.

### Automatic

When enabled, the platform worker queues the next review after the configured interval. Only one review lease can be active. Automatic mode remains subject to daily item, token, and cost limits.

### Scheduled

An admin supplies a timezone and daily local start time. The worker determines the next due occurrence and queues it once. Missed schedules do not create a flood; the next worker cycle creates one catch-up run within the configured backfill limit.

### Safe switches

The following switches are independent:

- Scanner enabled.
- Shadow mode.
- Create automated reports.
- Send automated warnings.
- Apply automated pairwise restrictions.

Initial production values keep the scanner in shadow mode and all three automated member-impacting actions off. A dry run never creates incidents, reports, notifications, or restrictions.

## Run controls and reliability

- Database-backed lease prevents concurrent scanners.
- Durable cursor records the last eligible content position.
- Stable fingerprints make retries idempotent.
- Per-run, daily, group, and account limits prevent review storms.
- Failed/partial runs retain metrics and can resume safely.
- Backfill requires explicit start/end dates and respects the maximum backfill window.
- Run history records source counts, candidates, provider calls, estimated cost, deduplication, errors, and duration.
- Notification routing failures do not lose the underlying report; they are logged for retry/review.

## Configuration

Admin-editable configuration includes:

- Mode, timezone, local schedule time, and interval.
- Maximum items per run/day and maximum backfill days.
- Context window limits.
- Candidate dictionary and policy version.
- Primary and fallback model identifiers.
- Provider call, token, and estimated-cost budgets.
- Review thresholds and routing.
- Shadow/report/warning/restriction switches.
- Restriction escalation and decay periods.

Secrets remain environment variables. The UI never displays provider keys.

## Review queue

Reviewers can filter by reference, account, location, group, source, status, policy code, date, or assigned moderator. A candidate view shows the bounded evidence snapshot, location/permalink, involved accounts, model/local rationale, policy version, duplicate history, and allowed actions. Dismissal and approval both require a reason and create history events.

## Staged implementation checklist

### Stage 1 - Data and type schema

- [ ] Add enums and models for configuration, incidents, reports, commendations, disputes, dispute participants/messages, restrictions, review candidates, scan runs, lease/cursor, and append-only events.
- [ ] Add stable references, indexes, uniqueness/fingerprint constraints, and ownership relations.
- [ ] Generate Prisma client, apply the additive schema, and run type checking.

### Stage 2 - Core business logic

- [ ] Add reference generation, evidence hashing, source allowlist, permission resolution, notification routing, and audit events.
- [ ] Add manual report/commendation services and account folders.
- [ ] Add dispute lifecycle and explicit resolution/override rules.
- [ ] Add pairwise restriction creation, escalation/decay, and authoritative interaction guard.
- [ ] Add scanner lease/cursor/idempotency, candidate detection, bounded context, provider abstraction, structured validation, budgets, metrics, and scheduling.

### Stage 3 - Routes and enforcement

- [ ] Add authenticated member APIs for reports, commendations, folders, disputes, statements, and participant resolution.
- [ ] Add admin APIs for configuration, run/preview/backfill, run history, review queue, assignment, approval, dismissal, and override.
- [ ] Register the platform-job handler and due-schedule enqueue function.
- [ ] Enforce pairwise restrictions in feed replies/comments/mentions, group forum replies/mentions, and creation of new direct-message conversations without reading message history.

### Stage 4 - Interactive UI

- [ ] Add Report and Commend actions to eligible stream/group content.
- [ ] Add the member Reports and Commendations folder and dispute screens.
- [ ] Add Platform Management Communication Review controls, history, and review queue.
- [ ] Add clear safe-mode, privacy-boundary, budget, and run-status copy.

### Stage 5 - Verification and documentation

- [ ] Add at least 40 contextual evaluation fixtures.
- [ ] Add unit tests for references, evidence hashes, fingerprints, scheduling, escalation/decay, and structured-output validation.
- [ ] Add authorization/query-boundary/integration tests proving private messages and mail are never scanned.
- [ ] Add manual-report, commendation, dispute, restriction, notification, idempotency, retry, and scheduling tests.
- [ ] Update environment examples, Admin Hat, Users Manual, and module documentation.
- [ ] Run Prisma validation/generation, typecheck, lint, focused tests, and production build.

## Acceptance criteria

The feature is ready for its safe initial release when manual reports and commendations work end to end, disputes cannot auto-close, pairwise restrictions are enforced server-side, eligible moderation ownership is correct, the scanner can run manually/automatically/on schedule in shadow mode, repeated runs are idempotent, run history is auditable, and automated member-impacting actions remain disabled. Automated scanning is not ready if any scanner adapter can access private chat or mail content.
