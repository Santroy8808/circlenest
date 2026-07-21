# Gallery and Conduct Repair Snapshot

Date: 2026-07-21

Branch: `main`

Scope: Conduct-report atomicity and Gallery/My Pics media lifecycle repairs from the 2026-07-21 Free, Contributor, and Administrator audit.

## Completed commits

- `4b1c712` — rebuild conduct review on atomic workflows.
- `0befd3a` — add the durable `DELETING` gallery-media state.
- `c3a4b9a` — make gallery storage deletion and media-reference ownership durable.
- `0a2df6a` — complete Gallery deletion/retry and avatar/banner interactions.

## What is new

### Conduct report review

- `/admin/actions/conduct-review` is now a searchable report-review workspace rather than a scanner-control placeholder.
- Search and the report-status/reviewer filters run as one bounded server query.
- Administrators can inspect the report, incident, member, source, evidence, policy, assignment, and linked dispute.
- Reviewer assignment accepts only active authorized administrators and detects intervening changes.
- The UI and service expose only legal report transitions. Every mutation requires an administrative reason and note.
- Mutations reauthorize the actor inside the transaction, compare report/incident versions, lock records in stable order, retry bounded serialization conflicts, and persist idempotent receipts with conduct, admin-action, and audit history.
- Manual report creation, candidate operations, dispute operations, notifications, and incident aggregation use the same concurrency-safe principles.
- `ConductIncident.version` defaults to `1` and supplies aggregate compare-and-set protection.

### Gallery and profile media

- A confirmed delete hides the exact selected photos immediately by marking them `DELETING`; it no longer reports database removal as completed storage deletion.
- Deletion is a durable `DestructiveActionRequest` plus `gallery.media-delete.v1` platform job with an immutable VITAL storage manifest.
- The DELETE password is enforced at the service boundary.
- Protected system media and media still referenced by another live feature are rejected before a deletion request is created.
- The worker waits out presigned-upload replay windows, removes public/private main and thumbnail objects, independently verifies absence, and only then removes database rows.
- Duplicate requests converge. Transient failures retry, terminal recovery is bounded, and failed/cancelled requests can be retried after renewed DELETE-password confirmation.
- Database triggers and matching service fences prevent missing, deleting, or otherwise non-ready media from being attached to Stream content, ads, business articles, chat, mail, groups, Market listings, and Scientology commendations.
- Gallery now shows queued, running, and failed removal state, polls active work, explains safe failure causes, and provides confirmed Retry.
- Avatar/banner mutations validate the exact selected asset, URL, and target field and convert malformed JSON, HTML proxy errors, and network failures into stable messages instead of client crashes.
- System-managed images remain outside member management controls and empty-gallery counts.
- Gallery controls, feedback, metadata overlays, and deletion status are responsive and readable in light and dark themes.

## Database and operations

Apply these additive migrations in order:

1. `prisma/migrations/20260721140000_conduct_incident_version`
2. `prisma/migrations/20260721143000_gallery_media_deleting_state`
3. `prisma/migrations/20260721150000_media_asset_reference_fence`

No manual data backfill is required.

Deploy the application and platform-job worker together. The worker must continuously process `gallery.media-delete.v1` and must have delete plus verification access to the public and private Cloudflare R2 buckets. If the worker is unavailable, affected photos remain safely hidden and recoverable in `DELETING`.

Future direct database writers must satisfy the new `READY` media-reference triggers.

## Verification completed

- 49 focused conduct tests passed.
- 39 focused Gallery/profile-media tests passed.
- Targeted ESLint passed.
- Prisma schema validation passed.
- A clean production build passed with 199 application routes.
- Gallery visual checks passed at desktop, `390px`, and `320px` in light and dark themes with one phone column, readable overlay text, no clipped controls, and no horizontal overflow.
- An independent final review found no remaining actionable issue in deletion-status synchronization or light-theme Gallery contrast.

## Release and deployment status

- The code repairs are complete locally.
- The production site has not been updated as part of this repair/documentation batch.
- `F-007` / `LIVE-001` is recorded as repaired in code, with production confirmation still pending.

## Required production confirmation

After deployment:

1. Upload a normal member photo and change its supported visibility.
2. Set that exact asset as avatar and banner and confirm each profile field updates without a client exception.
3. Queue a real R2 deletion and confirm main/thumbnail objects are verified absent before the database rows disappear.
4. Exercise a failed/cancelled deletion and confirmed Retry.
5. Re-run the conduct report search, assignment, legal transition, duplicate command replay, and stale-version conflict paths with two administrators.

These repairs close only the conduct atomicity and Gallery `F-007` work. Other findings in `docs/qa/2026-07-21-free-contributor-admin-release-audit.md` remain separate release work.
