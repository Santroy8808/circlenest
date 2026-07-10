# Theta-Space Launch Readiness and Staged Release Plan

**Assessment date:** 2026-07-10

**Release model:** Invite-only throughout the launch stages described here
**Current recommendation:** Do not expand beyond a small closed alpha until the P0 gates in this document are complete. In particular, the placeholder Terms of Service is a launch blocker.

## 1. Product decision in one page

Theta-Space becomes useful when an invited member can complete this loop without instruction:

> Accept invitation -> establish identity -> find a relevant person or group -> communicate -> receive a response -> return.

The free product must make that entire loop reliable and pleasant. A paid tier should sell greater reach, organization, professional presentation, storage, and operating leverage. It must not sell access to ordinary human conversation.

The recommended launch sequence is:

1. Staff and seeded-community rehearsal.
2. Closed alpha with 25-75 invited people.
3. Private beta with 100-300 invited people.
4. Expanded invite beta with 500-1,500 people.
5. Public-facing, invite-only expansion: public marketing and explanation pages, but an invitation remains required to create an account.
6. Paid Contributor and Professional upgrades approximately three to four months after the first stable beta cohort, provided the engagement and safety gates below are met.

This is not a recommendation to open public registration. “Public expansion” means that people can learn about Theta-Space publicly and invited cohorts can grow; account creation remains invitation-gated unless a separate product and safety decision changes that policy.

## 2. Code-evidence baseline

This plan is based on the repository behavior, not only on proposed product ideas.

| Area | Current code evidence | Product implication |
| --- | --- | --- |
| Invite entry | `src/components/auth/login-form.tsx` exposes **Have an invite?** and opens `/signup` in a new tab with `noopener`; `src/components/auth/signup-form.tsx` requires `inviteCode`. | The requested “have an invite” shortcut exists and preserves the login page. Keep it visible in every launch stage. |
| Account recovery | `src/app/api/auth/forgot-password/route.ts` and `src/app/api/auth/reset-password/route.ts` implement recovery; the forgot-password response is deliberately generic. | Recovery is a core free capability and should be included in launch task testing. |
| Onboarding sequence | `getOnboardingState()` in `src/modules/onboarding/onboarding.service.ts` sends people through profile, Scientology information, good-standing confirmation, terms, then `/home`. Profile and Scientology steps support explicit skip actions; good standing and terms are required. | The required/optional distinction should stay obvious. The flow has a finite destination and supports a low-friction path. |
| Legal acceptance | `src/components/onboarding/onboarding-forms.tsx` currently displays “Final Terms of Service will be inserted here.” `acceptTerms()` stores `termsAcceptedAt`. | The UI collects acceptance of unfinished legal text. This is a P0 blocker; storing only a time also does not identify which legal version was accepted. |
| Primary navigation | `src/components/platform/app-shell.tsx` groups Home, Connect, People, Explore, Tools, and Settings. It includes Stream, Pictures, Search, Messages, Mail, Notifications, Alerts, People, Friends, Groups, Market, Events, Jobs, Auditors, profile, resume, membership, and settings. | The feature surface is broad enough for a useful community, but first-time users need progressive disclosure and a small number of primary choices. |
| Restricted seeker experience | `src/components/platform/app-shell.tsx` renders a reduced navigation for the auditor-seeker role. | Role-specific simplification already has a precedent and should be used for other progressive-disclosure decisions. |
| Community communication | Feed, comments, chat threads/messages, mail threads, notifications, alerts, social graph, and group routes exist under `src/app/api`. | The free launch should concentrate on making these connected surfaces coherent rather than adding another major module. |
| Membership entitlements | `src/modules/membership-policy/policy.ts` defines Free, Contributor, Professional, Auditor, and Organization feature sets and limits. `canUserAccessFeature()` in `src/modules/membership-policy/membership-policy.service.ts` is used by group, event, market, job, auditor, storefront, advertising, writer, fundraiser, and invite services. | Membership policy is the current runtime entitlement boundary. Paid launch changes must be tested at both page and service/API levels. |
| Current Free policy | `FREE_POLICY` currently enables group creation, capped market listings and photos, storefronts, job listings, auditor profiles, moderation, and 1 GB of storage in addition to core social features. | Do not silently remove working free capabilities after beta. Any entitlement reduction needs a migration, grandfathering decision, and clear notice. |
| Higher tiers | `CONTRIBUTOR_POLICY` adds feed post types, larger/moderated groups, market ads, Writers Corner, invites, and 2 GB. `PROFESSIONAL_POLICY` adds event creation, general ads, fundraisers, mass mail, unlimited listing/photo/fundraiser limits, and 10 GB. | The code already contains a credible paid value ladder, though several benefits need safety and usefulness validation before promotion. |
| Admin feature flags | `src/modules/admin-moderation/admin-moderation.service.ts` reads and upserts `FeatureFlag` records for the admin portal. A repository search found no runtime consumer outside that admin service. | A flag visible in Admin is not currently evidence of a working kill switch. Risky releases must use an enforced entitlement/release gate or wire the generic flag into every relevant server and UI path. |
| Checkout controls | Subscription and credit checkout buttons and their API routes use idempotency keys; billing webhooks persist processing state. | Billing can be canaried later, but financial reconciliation and retry testing remain release gates. |
| Private uploads | Shared durable upload intents are used by market photos and resumes, with completion handled through their services. | Upload authorization, object privacy, expiration, duplicate completion, and cleanup must be exercised in the production-like test matrix. |

## 3. Who the first release is for

The design target should be a mainstream adult using a phone while distracted, with limited patience and no knowledge of Theta-Space’s internal vocabulary. That is a more respectful and testable target than designing around an IQ number.

### Persona A: first-time invited member

- Arrives from an invitation or from the login page’s invite link.
- Wants to know why the invitation matters, what is required, and when setup will end.
- May be reluctant to fill in a long profile before seeing value.
- Success: reaches Home, recognizes one useful next action, and makes a first interaction in less than five minutes excluding email delivery time.

### Persona B: returning communication-first member

- Comes back because somebody replied, sent a message, or posted in a group.
- Wants to reach the relevant context immediately, respond, and return to where they were.
- Success: opens a notification and replies in no more than three clear actions.

### Persona C: group participant or organizer

- Needs to discover or join a group, understand its rules, and participate.
- An organizer additionally needs member controls, moderation, and understandable limits.
- Success: a participant can find, join, and post without reading help documentation; an organizer can identify what is free versus paid before investing work.

### Persona D: professional or business member

- Wants a storefront, listing, event, job, promotion, professional identity, or audience tools.
- Will pay for credibility, scale, analytics, workflow efficiency, and controlled reach.
- Success: can understand the tier benefit before checkout and can recover from a failed or abandoned checkout without duplicate billing.

### Persona E: auditor seeker

- Has a narrow task and should not be exposed to the entire community toolset.
- Success: finds the relevant auditor path, communicates safely, and can manage profile/account basics. The existing restricted navigation is the right pattern.

### Persona F: moderator or administrator

- Needs a prioritized queue, context, audit history, reversible actions, and reliable emergency controls.
- Success: can identify abuse, act consistently, and verify the effect without inspecting the database.

## 4. Core free product

The following capabilities should remain free because together they create the community’s minimum useful loop.

### Identity and access

- Invitation-based signup, email verification, login, logout, and password recovery.
- A short profile with photo, name, short introduction, and privacy choices.
- Optional onboarding information that can be skipped without penalty.
- Clear account state and a direct way to get help.

### Discovery and relationships

- Search/browse people and view an allowed profile.
- Friend/connect request, accept/decline, unfriend, block, and report.
- Search/browse groups and participate in an allowed group.
- Browse events, market listings, jobs, and auditor information even when creation or promotion is a paid benefit.

### Communication

- Read and create ordinary feed posts.
- Comment/reply and use basic reactions.
- One-to-one and group conversation appropriate to the current relationship/privacy rules.
- Mail for longer-form communication where it serves a distinct purpose from chat.
- Notifications and alerts that deep-link to the exact context.
- Basic attachment/photo sharing within safe limits.

### Trust, safety, and control

- Block, report, privacy controls, and account/session security must never be paywalled.
- A person who blocks another person must be protected consistently in feed, search, profiles, chat, mail, groups, mobile endpoints, and notifications.
- Clear moderation status and appeal/help paths.
- Accessible light and dark modes, keyboard use, readable zoom, and reduced-motion behavior.

### Recommended launch navigation

The current application shell exposes a large inventory. For new free members, use five conceptual destinations and reveal detail inside them:

1. **Home** — stream and a visible create-post action.
2. **Connect** — messages/mail plus an unread indicator; notifications should lead to context rather than feel like another inbox.
3. **People** — search, friends, and groups.
4. **Explore** — market, events, jobs, and auditors, with browse-first presentation.
5. **Me** — profile, pictures, membership, and settings.

Tools such as ads, Writers Corner, fundraisers, business operations, and mass mail should appear only when the member has access or when a restrained upgrade explanation is relevant. Disabled primary navigation full of locks will make a new site feel unfinished.

## 5. Paid value after three to four months

Paid value should answer “How can I do more?” rather than “May I talk to people?”

### Contributor: community power tools

Good near-term benefits, largely consistent with the existing policy model:

- Additional post/change types and richer publishing tools.
- Larger groups and assignment of group moderators.
- Writers Corner access.
- Increased storage.
- Controlled member invitations once cohort capacity and abuse controls are ready.
- Limited listing promotion or an included promotional credit, with transparent labeling.

Benefits worth adding only after usage research validates demand:

- Post drafts and scheduling.
- Saved searches and personal filters.
- Group templates, onboarding questions, and lightweight engagement analytics.
- More profile presentation choices that do not reduce accessibility.

### Professional: operating and growth tools

Good near-term benefits, also aligned with existing policy keys:

- Event creation and management.
- Expanded/unlimited market, storefront, and job operations.
- Business or organization presentation.
- General advertising and campaign controls with transparent delivery and spending history.
- Fundraiser creation after compliance and disbursement controls are proven.
- Higher storage and asset limits.
- Audience and conversion analytics using privacy-preserving aggregates.
- Team roles, delegated administration, exports, and workflow automation.

Mass mail can be valuable, but it is a high-risk capability. It should ship only with explicit recipient eligibility, rate caps, unsubscribe/suppression behavior, abuse monitoring, and an emergency runtime kill switch. It should not be marketed merely because the entitlement key exists.

### Never use these as an upgrade wall

- Reading or replying to ordinary messages.
- Receiving replies and essential notifications.
- Basic posts, comments, reactions, and group participation.
- Blocking, reporting, privacy, security, account recovery, or accessibility.
- Access to a member’s own content and reasonable account/data export.

## 6. Staged release plan

All stages remain invite-only. Advance by evidence, not by calendar alone.

| Stage | Cohort and duration | Enabled scope | Primary question | Exit condition |
| --- | --- | --- | --- | --- |
| 0. Rehearsal | 10-25 seeded staff/test accounts; 3-7 days | Full free communication; billing disabled or test-only | Can a realistic network generate conversations, notifications, moderation cases, uploads, and edge conditions? | P0 automated checks pass; seeded users complete the critical task matrix in light/dark and mobile/desktop; rollback is rehearsed. |
| 1. Closed alpha | 25-75 invited members; at least 2 weeks | Core free loop; risky professional tools off | Can an invited person activate and get a useful response without staff coaching? | At least 90% moderated-test task success; no unresolved P0 privacy/security/data-loss issue; activation and response targets are plausible for two consecutive cohorts. |
| 2. Private beta | 100-300 invited members; 3-6 weeks | Stable free loop; selected professional tools for staff/canary accounts; test or limited paid checkout | Does the community retain people, and can operations handle real support and moderation volume? | Reliability targets hold for 14 days; support-blocked sessions under target; billing reconciliation and entitlement downgrade tests pass. |
| 3. Expanded invite beta | 500-1,500 members; 4-8 weeks | Core free product; controlled invitation allocation; Contributor/Professional canary | Do invitations create healthy, responsive clusters without abuse or degraded performance? | Safety response SLA, D7 retention, reply rate, performance, backup/restore, and incident drills meet gates for 30 days. |
| 4. Public-facing invite expansion | Capacity-based cohorts | Public marketing/explanation pages; invite required for signup; paid tiers generally available if proven | Can demand grow without confusing “public” with open registration or weakening community quality? | Weekly capacity review; feature kill switches proven; no gate regression. |

If a stage misses a gate, hold the cohort size, fix the failure, and re-run the same measurement window. Do not compensate for weak activation by sending more invitations.

## 7. Critical task flows and usability targets

### Flow 1: activate an invited account

`Login -> Have an invite? -> Signup with invite -> Verify email -> optional profile -> optional Scientology details -> required good-standing answer -> required terms -> Home`

Targets:

- Fewer than five minutes of active work, excluding email delivery.
- Every optional screen says “Optional” and provides **Skip for now**.
- A visible progress cue answers “where am I?” and “how much remains?”
- Back navigation never loses already submitted information or creates a redirect loop.
- A “No” good-standing answer clearly explains that activation will end before submission.
- Terms show final, dated/versioned text and a durable link for later review.
- Home presents one dominant next action: find people or make a first post, based on available seed data.

### Flow 2: find and contact a person

`People/Search -> Profile -> Connect or Message`

Targets:

- Relevant result within one search action.
- Relationship and privacy state described in plain language.
- No more than three actions from result to a sent message/request.
- Blocked or unavailable states fail safely without exposing private existence or content.

### Flow 3: post and receive a response

`Home -> Compose -> Post -> Another user replies -> Notification -> Context -> Reply`

Targets:

- Composer is visible and labels audience/privacy before posting.
- An ordinary text post takes no more than two actions after text entry.
- Optimistic state never implies success after a failed write.
- Notification opens the exact post/comment, focuses context, and offers a predictable route back.

### Flow 4: join and use a group

`People/Groups -> Browse/Search -> Group -> Join -> Discussion -> Reply`

Targets:

- Public/private membership behavior is understandable before joining.
- Group rules and moderator identity are easy to find.
- A new participant can post/reply without encountering organizer-only controls.

### Flow 5: upload and reuse media

`Create/Profile/Listing -> Select asset -> Upload -> Complete -> View permitted result`

Targets:

- File type and size rules appear before upload.
- Progress, cancellation, retry, and failure states are explicit.
- A completed upload is not public unless the surrounding content/privacy state permits it.
- Expired or replayed upload intents fail safely and abandoned objects are cleaned up.

### Flow 6: upgrade later

`Membership -> Compare -> Select package -> Stripe -> Return -> Entitlement visible`

Targets:

- A person can distinguish recurring plans from one-time credit packages.
- Price, renewal, cancellation, taxes/fees, and resulting capability are visible before leaving the site.
- Refresh, double-click, back, timeout, and webhook retry do not create duplicate purchases.
- Cancelled checkout returns to a coherent state; successful checkout becomes visible without requiring logout.

## 8. Cognitive-load and interaction rules

Apply these rules to alpha acceptance testing:

- One visually dominant action per screen or card.
- Use direct verbs: **Post**, **Send**, **Join**, **Save**, **Skip for now**. Avoid internal terms such as “policy evaluation,” “feature key,” “webhook,” or “intent.”
- Put field-level errors beside the field, preserve input, and state how to recover.
- Keep required and optional fields visually distinct; do not rely on an asterisk alone.
- Confirm destructive or irreversible actions and describe their scope.
- Keep the Back action predictable and never turn a browser Back into a logout or redirect loop.
- Use counts and labels consistently: “2 unread messages” is better than an unexplained badge.
- Do not show unavailable tools merely to advertise the size of the product; introduce upgrades at the point of demonstrated need.
- Empty states should contain one useful next action and, during early cohorts, enough seeded content that Home does not look abandoned.
- Meet WCAG AA text/non-text contrast, visible keyboard focus, logical tab order, 44px touch targets where practical, 200% zoom, and reduced-motion expectations.

## 9. Visual QA matrix

Automated screenshots should be compared, but final acceptance requires human inspection because clipped borders, hierarchy, and legibility are contextual.

### Viewports and modes

- Widths: 320, 375, 768, 1,024, and 1,440 CSS pixels.
- Light and dark themes at every critical flow.
- Browser zoom: 100%, 125%, and 200% for the core flows.
- Keyboard-only navigation and a reduced-motion operating-system preference.
- Long realistic names, unbroken URLs, multi-line errors, empty data, maximum badge counts, and loading states.

### Grid overlay inspection

Use an 8px spacing overlay plus column guides at 768px and above. Check:

- Page gutter alignment between the application shell and first/last card.
- Repeated card titles, metadata, controls, and footer actions landing on the same rhythm.
- Nested grids not creating a one-pixel drift or double gutter.
- Sidebars and main content maintaining intended widths before they stack.
- Fixed/sticky headers not covering anchors, focus targets, or the final row.

### Card, box, and border inspection

For every card family in Home, People, Groups, Connect, Explore, settings, and Admin:

- Inspect all four edges at normal and high-DPI scale; no edge may be clipped by overflow, transforms, sticky containers, or the viewport.
- Inspect first/last child states, focus rings, selected states, hover states, skeletons, and error boxes.
- Prevent adjacent borders from becoming visually double-weighted unless deliberate.
- Ensure rounded corners contain backgrounds, images, and focus outlines correctly.
- Confirm scrollbars do not hide the final action or crop a horizontal border.
- Confirm modal/dialog focus rings are not clipped by an ancestor with `overflow: hidden`.

### Color and typography inspection

- Measure contrast for body, muted, placeholder, error, success, link, disabled, selected, and focus colors in both themes.
- Do not communicate status by color alone; include text or an icon with an accessible name.
- Check translucency over every actual background, not just the design token’s base color.
- Keep paragraph line length near 45-75 characters where prose is expected.
- Verify bold/regular distinctions remain legible on Windows text rendering and at 125% scaling.

### Visual evidence required for a stage advance

- A named screenshot set for each critical task at all five widths and both themes.
- A defect log with viewport, theme, route, expected result, actual result, screenshot, severity, and owner.
- No open clipped-content, invisible-focus, unreadable-text, hidden-primary-action, or horizontal-page-scroll defect on a critical flow.

## 10. Performance and response expectations

Use these as initial beta service-level objectives; revise after real cohort baselines, but do not remove the measurement.

- Core message/post/comment write success: at least 99.5%, excluding deliberate validation or authorization rejections.
- Core read endpoint p95: under 800 ms at expected beta concurrency.
- Core write endpoint p95: under 1.5 seconds, excluding direct-to-storage transfer time.
- Web Vitals at the 75th percentile: LCP at or below 2.5 seconds, INP at or below 200 ms, and CLS at or below 0.1 on representative mobile traffic.
- No unbounded list response on a primary route; paging must preserve continuity during concurrent writes.
- Upload UI must acknowledge selection immediately and surface progress rather than appearing frozen.
- Notification delivery should be measured separately from notification-page rendering so operational delay is diagnosable.

Every metric must be segmented by viewport/device class, theme where relevant, authenticated role, route, and release cohort. An overall average can conceal a broken mobile or low-bandwidth experience.

## 11. Release gates

### P0: legal, privacy, security, and data integrity

- Replace the placeholder Terms of Service with approved text before any external cohort.
- Store the accepted legal document version/hash as well as the acceptance time, and give members a stable way to review it.
- Prove invitation enforcement server-side for signup and show generic outcomes for account recovery.
- Prove block and privacy rules across web and mobile feed, search, profile, chat, mail, group, notification, and media paths.
- Prove private objects cannot be fetched through a public or guessed URL and that every upload completion belongs to its authenticated initiator.
- Exercise expired, duplicate, abandoned, and cross-user upload-intent cases.
- Prove payment creation and webhook processing are idempotent; reconcile purchase, transaction, entitlement, and Stripe records.
- Scan the production artifact and deployment configuration for seeded credentials, debug bypasses, source maps containing secrets, and non-production callback URLs.
- Apply migrations to a production-like copy, back up before release, restore the backup, and time the rollback.
- No unresolved P0 or P1 authorization, privacy, data-loss, payment, or account-takeover defect.

### Functional and visual

- Lint, typecheck, build, unit tests, and selected end-to-end tests pass from a clean checkout.
- Three ordinary seeded users, one restricted seeker, one moderator, and one admin complete the role-appropriate critical task matrix.
- Core flows pass in all visual-QA viewports and both themes.
- At least five representative target users complete activation, find/contact, post/reply, notification/respond, and group participation with at least 90% task success and without staff instruction.
- Accessibility scan has no critical issue; keyboard and screen-reader spot checks are performed by a human.

### Reliability and operations

- Application and job health, error rate, latency, queue delay, email delivery, object-storage errors, and billing-webhook failures are observable.
- Alerts have a named owner and a usable runbook; an incident rollback and feature-disable drill has been completed.
- Rate limits and abuse controls have safe user-facing recovery behavior.
- Backup restore, data retention, and deletion/export procedures have been exercised.
- Admin actions that affect members produce auditable actor, target, reason, time, and outcome records.

### Runtime release controls

- Every risky capability has a server-enforced release check and a matching UI state.
- Verify the exact route/service behavior when a release control is disabled; hiding a link is not sufficient.
- Do not count generic Admin `FeatureFlag` records as kill switches until runtime consumers exist and are tested.
- Membership entitlements and release rollout are separate questions: a paid user may be entitled to a feature that the operator still needs to disable globally.

## 12. Product health gates and definitions

Initial targets for each invited cohort:

| Measure | Definition | Initial target |
| --- | --- | --- |
| Invitation conversion | Accepted/verified accounts divided by delivered invitations | Baseline in alpha; investigate large delivery or copy drop-offs rather than optimizing a vanity percentage. |
| Activation | Verified invitees who finish onboarding and perform one meaningful interaction within 24 hours | At least 70% |
| First-session value | Activated members who post/comment, send a message, join/participate in a group, or form a connection in the first session | At least 60% |
| Response experience | Members making a first outreach who receive a human reply within 48 hours | At least 40% in alpha; grow through seeding and community operations |
| D7 activated retention | Activated members with a meaningful interaction on day 7, using a defined return window | At least 25% before broad expansion |
| Moderated task success | Completed critical tasks without facilitator intervention | At least 90% |
| Support-blocked sessions | Sessions where the member cannot continue without staff correction | Under 5% |
| Core operation success | Successful core writes divided by attempted valid core writes | At least 99.5% |

“Logged in,” “page viewed,” and “notification received” are not meaningful interactions by themselves. Define meaningful interaction as a post/comment, sent message/mail, group participation, accepted connection, listing inquiry, event response, or another action that creates value for a person.

Track cohorts by invitation source and activation week. A growing total member count cannot justify expansion if new members do not receive replies.

### Minimum analytics vocabulary

Instrument, with stable event names and outcome fields:

- `invite_opened`, `signup_started`, `signup_completed`, `verification_completed`
- `onboarding_step_completed`, `onboarding_step_skipped`, `onboarding_completed`
- `person_search_completed`, `connection_requested`, `connection_accepted`
- `first_post_created`, `first_comment_created`, `first_message_sent`, `first_group_joined`
- `reply_received`, `notification_opened_to_context`, `meaningful_return`
- `upload_started`, `upload_completed`, `upload_failed`
- `checkout_started`, `checkout_returned`, `entitlement_applied`, `checkout_reconciled`
- `operation_failed` with sanitized route/operation, category, cohort, and correlation ID

Never place raw invite codes, reset tokens, message bodies, private profile text, payment secrets, or object URLs in analytics.

## 13. PR prioritization

### Must have before closed alpha

- Final, versioned Terms of Service and acceptance record.
- Proven invite, identity, privacy/block, media, and recovery boundaries.
- The complete free communication loop with seeded content and notifications.
- Critical responsive/light/dark/accessibility fixes.
- Monitoring, backups, rollback, and operator ownership.
- Runtime release controls for any risky feature included in the cohort.

### Should have before private beta

- First-session guidance and purposeful empty states.
- Consolidated navigation and progressive disclosure of Tools.
- Cohort/activation/reply analytics and support taxonomy.
- Moderator queue and auditable outcomes.
- Tested billing canary, entitlement upgrades/downgrades, and reconciliation if money is enabled.
- Measured API and browser performance under realistic seed volume.

### Could have before expanded beta

- Saved searches, drafts, scheduling, lightweight group analytics, richer profile presentation, and business workflow conveniences.
- Referral/invite allocation controls for proven healthy members.
- Controlled Contributor/Professional experiments with clear grandfathering rules.

### Explicitly not a launch dependency

- Open public registration.
- A large number of paid plans or microtransactions.
- Mass mail, general advertising, or fundraiser access merely to make the product appear complete.
- New major modules before the core interaction/reply loop is healthy.

## 14. Known blocker and decision register

| Severity | Item | Evidence | Required decision/action |
| --- | --- | --- | --- |
| Blocker | Placeholder Terms of Service | `src/components/onboarding/onboarding-forms.tsx` explicitly says final terms will be inserted later, while `src/modules/onboarding/onboarding.service.ts` records acceptance. | Obtain approved terms, render the final document, store an immutable version/hash with acceptance, link it for later review, and test decline/re-acceptance behavior after a material revision. |
| High | Generic admin flags are not proven runtime controls | `FeatureFlag` reads/writes are confined to `src/modules/admin-moderation/admin-moderation.service.ts`; feature services use membership policy checks. | Add and test server-enforced global/cohort rollout checks before relying on Admin to stop billing, mass mail, ads, fundraising, or another risky module. |
| Gate pending | Production-like visual and end-to-end proof | Code presence is not evidence that the full user journey renders correctly under all data, viewport, theme, and role states. | Complete the visual matrix, seeded multi-user interaction run, automated checks, and defect log before stage advancement. |

## 15. Launch approval record

Before each stage, record:

- Release commit and deployment artifact identifier.
- Cohort size and invitation source.
- Enabled/disabled runtime capabilities and proof that disable controls work.
- Migration, backup, restore, and rollback results.
- Clean-checkout lint/type/build/test results.
- Visual-QA evidence location and unresolved defect list.
- Security/privacy/payment review status.
- Product metrics for the preceding cohort.
- Named product, engineering, operations, moderation, and legal approvers.
- Explicit **go**, **hold**, or **rollback** decision with date and rationale.

The release is ready to grow only when people can reliably create value for one another. Feature count, registrations, and page views are secondary to successful communication, timely replies, safe participation, and return behavior.

## 16. Feature-flag implementation audit

**Classification: persisted and audited admin configuration, but dead as a runtime control. It is not currently a kill switch.**

Evidence:

- `FeatureFlag` in `prisma/schema.prisma` stores an arbitrary unique `key`, `enabled`, description, optional metadata, and timestamps.
- `POST /api/admin/feature-flags` in `src/app/api/admin/feature-flags/route.ts` authenticates a session and delegates to `setFeatureFlag()`.
- `setFeatureFlag()` in `src/modules/admin-moderation/admin-moderation.service.ts` verifies an admin, validates the arbitrary key format, upserts the record, and writes admin-action, audit, and diagnostic records. `getAdminPortalView()` reads up to 80 flags, and `src/components/admin-moderation/admin-portal.tsx` displays their on/off values. The admin wizard therefore changes real database state, not merely local UI state.
- `isFeatureEnabled()` in `src/lib/platform/feature-flags.ts` can read that state, but a targeted repository search found no import or invocation outside its own file. Its companion setter is also separate from the audited admin service.
- The representative Events path does not read `FeatureFlag`: `src/app/events/create/page.tsx` checks `canUserAccessFeature(userId, "events.create")`; `createEvent()` in `src/modules/events/events.service.ts` repeats that check before persistence; and `POST /api/events` calls that service. `canUserAccessFeature()` resolves tier and user overrides through membership-policy tables. Consequently, setting the generic Admin flag `events.create=off` does not stop an entitled member, and the admin-role bypass also remains active.

Minimum future programming change:

1. Define a typed allow-list of operational release keys and seed explicit defaults; stop accepting arbitrary keys as if they are enforced controls.
2. Make one server-side release-check function the authority for those keys. For an entitled feature, effective access should be `runtime release enabled AND membership entitled`; a global off must be evaluated before any admin/tier bypass unless an explicitly documented emergency exception is intended.
3. Call that check in the mutation/service boundary for each controlled capability. Mirror it in the page/navigation for understandable UX, but never rely on hidden UI. Start with billing entry points, mass mail, ads, fundraisers, and event creation.
4. Either remove the unused unaudited setter in `src/lib/platform/feature-flags.ts` or route all writes through the authorized, audited service. Require an operator reason for high-risk changes and expose the effective state, not just the stored row, in Admin.

Minimum tests:

- Unit: missing-key/default behavior is explicit; disabled denies an otherwise entitled member and an admin; enabled still denies an unentitled member; enabled plus entitlement allows access; high-risk read failure follows the chosen fail-closed policy.
- Events integration: with `events.create` disabled, both the create page and direct `POST /api/events` are unavailable and no event is inserted; with it enabled, Professional is allowed and Free remains denied.
- Admin API: non-admin is rejected, unknown keys are rejected, valid updates persist, and actor/reason/audit data is written.
- Consistency: a flag change reaches all application instances within the documented cache window, and rollback from on to off is verified under concurrent requests.

## 17. State 05 seeded visual and interaction evidence

This evidence was collected against the isolated `codex_qa` dataset, not inferred from empty-state screenshots.

### Dataset exercised

| Entity | Count |
| --- | ---: |
| Users | 141 |
| Posts | 195 |
| Relationships | 1,248 |
| Mail items | 54 |
| Chat items | 40 |
| Groups | 12 |
| Market listings | 70 |
| Jobs | 10 |
| Notifications | 70 |
| Alerts | 30 |

The populated dataset gave the desktop review realistic card wrapping, long lists, relationship states, unread states, navigation density, and below-the-fold content. It is stronger evidence than a single clean account, but it does not replace production-volume load testing.

### Desktop visual coverage completed

At a 1,280-pixel desktop viewport, both light and dark themes were inspected on:

- Login and Home/feed.
- Messages and Mail.
- People.
- Groups list and group detail.
- Notifications.
- Market.
- Events list/detail, including RSVP state.
- Jobs.
- Auditors.
- Profile.
- Settings.

The review exercised actual post, friend, and event-RSVP interactions. Test mutations were cleaned up or restored afterward so the shared QA state was not left with artificial user-visible changes.

### Defects resolved during the review

- Dark-only/light-surface theme leakage was corrected across the affected surfaces rather than accepted as a dark-mode-only design.
- Mail tab presentation and state readability were corrected.
- Comment, group, event, auditor, and market surfaces were corrected for theme and card/layout consistency.
- The collapsed search control that had shrunk to approximately 29 pixels was corrected to remain usable.
- Third cards clipped at row/container boundaries were corrected.
- Message content/actions falling below the usable fold were corrected.
- The group-membership failure affecting members beyond 12 was corrected.
- The optional-onboarding redirect behavior was corrected.
- Notification tabs wrapping incorrectly were corrected.

These are resolved live defects, not deferred recommendations. Their closure should remain covered by regression screenshots or interaction tests so later global-CSS changes do not reintroduce them.

### Evidence still pending

- Mobile visual inspection and interaction runs at the target 320- and 375-pixel widths.
- Admin visual inspection, including dense tables, action wizards, flags, moderation states, keyboard flow, and both themes.
- Full onboarding visual inspection from invite/signup through optional steps, good-standing confirmation, terms, and Home, including back/skip behavior and narrow viewports.

The embedded QA browser stopped responding after the desktop pass and remained unavailable after a fresh connection and tab. Those three surfaces are therefore recorded as unverified, not passed. Desktop evidence alone is not a stage-advance sign-off while they remain pending.

Production was inspected read-only through the dedicated Windows account. The current release is clean on `main` at `9235c02`; the NSSM-managed web service, Caddy proxy, and public/loopback live, ready, and version endpoints returned HTTP 200. The ready endpoint reports Redis as a degraded optional dependency and confirms the database-backed fallback. This is evidence for the currently deployed release only, not the candidate branch.

Four candidate-release production gates remain:

1. **Terms blocker:** the placeholder Terms of Service must be replaced by approved, versioned text and acceptance must identify that version.
2. **Private-R2 gate:** production R2 configuration and every delivery path must prove private objects are not anonymously or predictably retrievable; authenticated/signed access, cross-user denial, expiration, revocation, and abandoned-upload cleanup must pass in the production-like environment.
3. **Fail-closed environment gate:** production must add valid HTTPS `APP_ORIGIN`, independent high-entropy `MOBILE_AUTH_SECRET` and `IP_HASH_SECRET` values, enforce SMTP TLS, and keep the private R2 bucket distinct from the public bucket before the new release starts.
4. **Background-worker gate:** the repository defines `worker` and `worker:once`, but production currently has no worker service, scheduled task, or worker process. Any release behavior that depends on continuous jobs must remain disabled until the worker is installed under a supervised service with logs, restart policy, and a health/last-run check.
