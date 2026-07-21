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

## Current admin report workspace

`/admin/actions/conduct-review` is the operational report-review workspace. It provides bounded server-side text search plus report-status and assigned-reviewer filters. Each result exposes the report, shared incident, member, source, evidence, policy, assignment, and linked-dispute context needed for a decision.

An administrator may assign or unassign an active administrator and apply only the status transitions legal for the report's current state. Every mutation requires an administrative reason and note. The server reauthorizes the acting administrator, compares report/incident versions, locks records in stable order, retries bounded serialization conflicts, and stores an idempotent command receipt with conduct events, `AdminAction`, and `AuditLog` records. A stale-version conflict must be refreshed and reviewed again; the UI must never silently overwrite the newer decision. An ordinary report transition cannot bypass a linked dispute.

## Scanner candidate review

Scanner candidates are separate from member-submitted conduct reports. Candidate approval/assignment has atomic backend support, but the full candidate filtering and manual/automatic/scheduled scanner-control experience described elsewhere in this document is not the current report-workspace UI. Do not describe location, group, source, policy, or date filters as available on the report page until they are implemented and verified there.

## Implementation status (2026-07-21)

### Implemented and regression-tested

- Conduct incidents, reports, evidence/history, disputes, participants, candidates, and administrative audit records are persistent. `ConductIncident.version` supplies aggregate compare-and-set protection.
- Manual report creation is serializable, deduplicated, versioned, notification-aware, and safe under concurrent submissions.
- Dispute opening, statements, participant resolution, administrative override, and aggregate incident recomputation use stable lock ordering and bounded serialization retries.
- Admin report search is bounded and server-backed. Text, status, and reviewer filters operate in the same query.
- Assignment accepts only an active authorized administrator (or unassignment) and detects intervening changes.
- Report transitions expose only legal state changes, require reason and note, preserve linked-dispute rules, and create durable idempotent receipts plus conduct/admin/audit history.
- Candidate approval and assignment reauthorize the actor and serialize against the shared incident.
- Forty-nine focused tests cover query parsing, UI/API contracts, transition parity, durable replay, authorization, locking, report creation, candidate handling, disputes, notifications, and aggregate status.

### Partially implemented or awaiting broader verification

- Member report/commendation, Reports and Commendations, dispute, and restriction surfaces exist, but remain part of the broader release audit and require the complete cross-account production matrix before release closure.
- Pairwise restriction behavior and every public/group write boundary must remain in the release regression suite.
- The current admin page is the report-review workspace. Scanner candidate operations and report operations must remain visibly distinct.

### Not yet declared complete

- The complete manual/automatic/scheduled scanner operations UI, provider configuration, budgets, run history, and shadow-mode browser workflow.
- The contextual evaluation fixture set and full proof that every future scanner adapter excludes private chat and mail.
- Automated reports, warnings, and restrictions. These remain disabled in the safe initial mode.

## Acceptance criteria

The feature is ready for its safe initial release when manual reports and commendations work end to end, disputes cannot auto-close, pairwise restrictions are enforced server-side, eligible moderation ownership is correct, the scanner can run manually/automatically/on schedule in shadow mode, repeated runs are idempotent, run history is auditable, and automated member-impacting actions remain disabled. Automated scanning is not ready if any scanner adapter can access private chat or mail content.
