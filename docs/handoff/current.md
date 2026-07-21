# Current Theta-Space Handoff

Updated: 2026-07-21

## First instructions for the next task

1. Work in `C:\Repos\Theta-Space-net\NewRepo`.
2. Read `docs/handoff/context-index.md` and `docs/feature-completion-standard.md` before opening code.
3. Read `docs/qa/2026-07-21-free-contributor-admin-release-audit.md` for the active release findings.
4. Read `docs/handoff/snapshots/2026-07-21-gallery-conduct-repairs.md` before changing conduct review or Gallery/My Pics.
5. Do not push to GitHub or update production unless the user explicitly says `push`.
6. If the user says `push`, follow `docs/server-update-quick-reference.md`: push GitHub, then update the production Windows server and verify health.

## Repository state

- Branch: `main`.
- Latest completed repair commits:
  - `4b1c712` — atomic conduct-review workflows.
  - `0befd3a` — durable Gallery `DELETING` state.
  - `c3a4b9a` — durable Gallery storage lifecycle and media-reference fences.
  - `0a2df6a` — Gallery deletion/retry and avatar/banner UI/API completion.
- The permanent change record is `docs/handoff/snapshots/2026-07-21-gallery-conduct-repairs.md`; inspect `git status` for any work created after this handoff.
- Preserve unrelated user-owned `outputs/`, `tmp/`, and `plans/ios-native-client-package-plan.md` content.

## Completed repair scope

### Conduct review

- The admin conduct page is a bounded, server-searched report workspace with text, report-status, and assigned-reviewer filters.
- Report/incident/member/source/evidence/policy/dispute context is available for review.
- Assignment and legal status transitions are versioned, reauthorized, serializable, idempotent, reasoned, and audited.
- Manual reports, candidate operations, disputes, notifications, and incident aggregation use stable lock ordering and bounded retry behavior.
- Migration `20260721140000_conduct_incident_version` adds `ConductIncident.version`.

### Gallery and profile media

- Member deletion is now asynchronous and truthful: accepted photos hide immediately in `DELETING`, then a durable job removes and verifies every R2 object before database cleanup.
- The DELETE password is enforced in the service, protected/system and externally referenced media are rejected, duplicate requests converge, and retry/recovery is bounded.
- Gallery shows queued/running/failed status and confirmed Retry.
- Avatar/banner operations validate the exact selected owned asset and target field and no longer crash on malformed responses.
- Database triggers plus matching service fences reject missing or non-ready media references across every integrated writer touched by the migration.
- Migrations:
  - `20260721143000_gallery_media_deleting_state`
  - `20260721150000_media_asset_reference_fence`

## Verification completed

- 49 focused conduct tests passed.
- 39 focused Gallery/profile-media tests passed.
- Targeted lint passed.
- Prisma validation passed.
- Clean production build passed with 199 routes.
- Gallery visual QA passed at desktop, `390px`, and `320px` in light and dark themes with no horizontal overflow or clipped controls.
- Final independent review found no actionable issue in deletion-state synchronization or Gallery light-theme contrast.

## Deployment status

- These repair commits and their migrations have not been deployed as part of this repair batch.
- Deploy the application and platform-job worker together.
- The worker must process `gallery.media-delete.v1` and have delete/verification access to both public and private Cloudflare R2 buckets.
- No manual migration backfill is required.

## Production checks still required

After deployment:

1. Re-run the retained Free-member Gallery flow and set the exact photo as avatar and banner.
2. Verify a real R2 deletion removes and confirms all main/thumbnail objects before deleting rows.
3. Verify failed/cancelled deletion Retry with renewed DELETE confirmation.
4. Exercise conduct search, assignment, legal transitions, duplicate command replay, and a two-admin stale-version conflict.
5. Update `F-007` / `LIVE-001` to production-pass only after those checks succeed.

## Remaining release work

The conduct atomicity and Gallery `F-007` repair are complete in code. The remaining findings in `docs/qa/2026-07-21-free-contributor-admin-release-audit.md` are not implicitly fixed. Continue one bounded audit module at a time, verify it, update the audit, and commit it before moving to the next module.

## Product rules to preserve

- Theta-Space is invite-only.
- Free and Contributor are the only enabled public tiers; Professional, Auditor, and Org remain hidden/disabled.
- Features outside a tier must be hidden at navigation, page, and API boundaries rather than presented as unusable gates.
- Do not create placeholder pages or false success flows.
- Desktop is priority one; Android is priority two; iOS packaging remains planned.
- Light and dark mode and narrow browser layouts must be verified.
- The gold triangle is the standard default Like reaction; the gold theta/spark/arrow is the standard send glyph.
- Production is the user-owned Windows server with self-hosted PostgreSQL. Railway and Neon are retired and must not appear as current infrastructure.

## Safe resume prompt

```text
Read C:\Repos\Theta-Space-net\NewRepo\docs\handoff\current.md, then docs\handoff\context-index.md and docs\qa\2026-07-21-free-contributor-admin-release-audit.md. Continue the next bounded audit repair. Do not push or deploy unless I explicitly say push. Verify locally before reporting completion.
```
