# Release Audit Core-Fix Plan

Date: July 21, 2026
Source: `docs/qa/2026-07-21-free-contributor-admin-release-audit.md`

## Objective

Repair the audit findings at their shared policy, authorization, persistence, and layout boundaries. UI checks must consume the same server-enforced contracts as direct routes and APIs. Professional, Auditor, and Org remain non-operational and hidden.

## State 01 - Canonical Contracts and Schema

1. Define one `MembershipAccess` contract containing persisted tier, operational tier, capabilities, quotas, temporary access, and Contributor offer state.
2. Treat Contributor eligibility, a visible beta offer, acceptance, and temporary promotional access as distinct lifecycle records.
3. Define one typed `AdminCommand`/receipt contract with command idempotency, actor/target authorization, reason, audit linkage, and optimistic versioning.
4. Add durable data contracts for Contributor offers, grant revocation, credit-ledger idempotency, destructive-action manifests, delivery outbox rows, actionable notifications, and report resolution attribution.
5. Define a typed feature registry; database rows hold overrides, not arbitrary feature definitions.

Primary files: `prisma/schema.prisma`, a new timestamped Prisma migration, `src/modules/membership-policy/policy.ts`, `src/modules/membership-policy/membership-access.ts`, `src/modules/admin-moderation/admin-command.ts`, and directly imported shared types.

## State 02 - Core Services and APIs

1. Resolve all membership decisions through the canonical access resolver.
2. Implement account-specific Contributor eligibility, offer creation/revocation, zero-charge beta acceptance, and the future `$4.99/month` disclosure snapshot.
3. Enforce public main-Stream posts, one active Free listing, three photos per listing, Contributor support/Writers access, and no Contributor business/storefront access.
4. Enforce ADMIN-to-MEMBER and GOD-to-ADMIN target hierarchy; no normal workflow may target GOD or self.
5. Make privileged mutations idempotent and atomic with mandatory audit receipts.
6. Make credits ledger-backed and concurrency-safe; move provider secrets behind a secret-store boundary.
7. Queue destructive cleanup and announcement delivery with durable manifests/outbox rows.
8. Add typed report transitions and actionable notification destinations.

Primary modules: `membership-policy`, `market`, `feed`, `profiles`, `media`, `business-accounts`, `business-storefront`, `writers-corner`, `admin-moderation`, `billing`, `feature-flags`, and their API routes.

## State 03 - Routing and Navigation

1. Add capability-based page/API guards and apply them to every affected direct route.
2. Derive desktop/mobile navigation from the same effective capabilities.
3. Expose Contributor support and Writers Corner; hide Free Stream filters and every disabled/business creation path.
4. Expose a member Contributor-offer route only when an active account-specific offer exists.

## State 04 - Interactive UI

1. Build the beta Contributor offer/acceptance surface and grant/revoke administration.
2. Repair avatar/banner actions, profile Stream identity matching, Market owner-only promotion, default multi-image carousel, manuscript notification links/cache refresh, group terminology/encoding, and staged attachment status.
3. Replace free-text Feature Flags with categorized registry controls and add real report transition actions.
4. Make status, loading, empty, success, and error messages truthful.
5. Update Users Manual, Admin Hat, membership copy, and policy text from canonical policy values.

## State 05 - Polish and Verification

1. Remove fixed/minimum widths causing `574px` member and `800px` admin documents at a `390px` viewport.
2. Bound overlays/popovers to the viewport, remove clipped inner widths, and correct light/dark contrast tokens.
3. Verify desktop widths plus `320`, `360`, `390`, and `412px` in light and dark themes.
4. Run workspace verification, Prisma validation/generation, lint, typecheck, build, targeted service tests, and authenticated browser regression flows.
5. Update the audit matrix with pass/fail evidence. Do not mark a row complete without a working UI-to-database flow.

## Release Rule

Do not deploy while any S0 or S1 finding remains. Do not expose a control unless its backend action, persistence, permission checks, audit record, and error handling are complete.
