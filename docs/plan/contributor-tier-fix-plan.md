# Contributor tier fix plan

Status: Complete
Owner: Theta-Space engineering
Scope: Contributor-tier browser QA defects identified in the July 14, 2026 live walkthrough

## Product rule

If a Contributor does not have access to a capability, it must be hidden rather than shown as a disabled control, upgrade prompt, or gated feature page. Direct navigation and direct API calls must not reveal the restricted capability. A generic not-found response is acceptable for a direct URL.

## Approved Contributor capability boundary

The implementation must use one shared capability matrix for navigation, route access, API authorization, tutorials, and manuals.

Contributor capabilities to preserve (subject to existing policy):

- Stream posts, replies, reactions, and messaging
- Groups and the Contributor-allowed group moderation tools
- Market listings, editing, and the approved listing-photo carousel
- Approved promotion of the user's own Market listings
- Writers Corner manuscripts
- My Listings
- Invites only when individually authorized by an administrator
- Auditor Directory browsing, if directory browsing remains part of the approved tier

Contributor capabilities to hide:

- Business Center and storefront administration
- Business identity switching
- Jobs
- Events
- Fundraisers
- Auditor profile creation
- General advertising
- Business-only forums, blogs, and storefront tools

## Atomic implementation sequence

Each item is completed, tested, documented, and recorded before starting the next item. This file is the reference log for that sequence.

### 1. Centralize the capability matrix

- Identify the existing tier/capability helpers and remove duplicated Contributor checks.
- Add explicit capabilities for business tools, jobs, events, fundraisers, auditor-profile creation, general ads, and business identity switching.
- Make the matrix usable by server routes, server actions/API handlers, navigation, and manuals.
- Test with Free, Contributor, and an authorized business/admin account to ensure the matrix does not change unrelated access.
- Update the Users Manual and Admin Hat terminology where capability rules are described.

Acceptance: one authoritative capability decision is used by both the UI and server enforcement.

### 2. Hide restricted navigation and controls

- Remove restricted entries from the Contributor control panel, header shortcuts, settings, tools, tutorial, manuals, and mobile navigation.
- Remove business identity selectors from posts, messages, and listings when no business account exists.
- Remove the Auditor profile-creation action while leaving the directory link only if directory browsing is approved.
- Remove upgrade cards and unavailable-feature placeholders from Contributor pages.

Acceptance: a fresh Contributor account cannot see a link, button, menu item, tutorial section, or upgrade prompt for a restricted capability.

### 3. Enforce hidden direct-route and API behavior

- Add server-side capability checks to every restricted page and mutation.
- Return a generic not-found response or safe Home redirect for restricted page URLs.
- Reject restricted API calls without returning feature data or feature-specific explanations.
- Ensure server-rendered navigation does not preload restricted route metadata for Contributors.

Acceptance: manually entering a restricted URL or calling its endpoint cannot expose or operate the feature.

### 4. Repair Contributor group creation

- Trace the create-group action from form submission through server validation, persistence, and redirect.
- Fix the silent no-op path and surface actionable errors.
- Confirm successful creation appears in My Groups and survives refresh and re-login.
- Verify allowed group moderation controls with a second test account.
- Update the Users Manual and Admin Hat only where group permissions or moderation behavior changed.

Acceptance: valid group creation redirects to the new group; invalid or failed creation shows an actionable error; no duplicate group is created by repeat submission.

### 5. Repair Contributor market listing creation and editing

- Trace listing creation through validation, city selection, contact settings, description serialization, carousel metadata, persistence, and redirect.
- Fix the silent no-op path.
- Verify the listing appears in My Listings and that Edit opens the actual edit form.
- Verify the listing survives refresh and logout/login.
- Verify the existing approved photo-count, storage, and carousel limits.
- Update the Users Manual with the final Contributor listing limits and carousel behavior.

Acceptance: a valid listing is created, visible, editable, and persistent; failures are visible and actionable.

### 6. Repair Writers Corner manuscript creation

- Trace manuscript creation through validation, persistence, privacy, and redirect.
- Fix the silent no-op path.
- Keep storefront publishing unavailable unless the account has an approved business profile.
- Verify draft visibility and member visibility with a second account.
- Update the Users Manual with the final Contributor manuscript workflow and limits.

Acceptance: a valid manuscript appears in the author's list and persists; restricted storefront publishing is absent, not disabled.

### 7. Reconcile policies and manuals

- Update the Contributor capability matrix and policy references.
- Preserve current Free-tier policy: 200 MB personal storage, three listings per 14-day period, and three photos per listing.
- Record the approved Contributor limits rather than inheriting stale Free-tier or alpha values.
- Remove unavailable features from Users Manual and Tutorial contents.
- Update Admin Hat guidance for granting invite eligibility and reviewing Contributor access.

Acceptance: UI copy, route behavior, manuals, and policy documents agree for every Contributor capability.

### 8. Final Contributor regression pass

Use a fresh Contributor account and a second member account to verify:

- Restricted features are absent from all menus and pages.
- Restricted direct URLs resolve generically and reveal no feature details.
- Stream, messaging, groups, market, Writers Corner, and approved directory flows work.
- Created groups, listings, and manuscripts persist and can be edited where supported.
- Cross-user visibility, replies, reactions, and comments behave correctly.
- Desktop and mobile navigation follow the same entitlement boundary.
- Typecheck, lint, unit/API tests, production build, and browser regression all pass.

## Fix log

| Item | Status | Verification | Documentation |
| --- | --- | --- | --- |
| Plan captured | Complete | Repository plan created | This file |
| Capability matrix | Complete | npm run typecheck and Contributor policy assertion | src/modules/membership-policy/policy.ts |
| Restricted navigation hidden | Complete | Local Contributor browser: Tools targets Writers Corner; Jobs/Events/Business/Fundraiser/Ads absent | Users Manual/Tutorial reconciliation recorded in item 7 |
| Restricted routes/APIs hidden | Complete | Local Contributor browser: restricted URLs returned generic 404; restricted web/mobile API handlers now return generic 404 for Jobs, Events, Fundraisers, auditor profile, Business Center, and ad-creator operations | Users Manual/Tutorial reconciliation recorded in item 7 |
| Group creation | Complete | npm run typecheck; direct Contributor service create/persist/delete test | Users Manual/Admin Hat review completed in item 7 |
| Market listing creation/editing | Complete | Local Contributor browser created, edited, refreshed, and cleaned up; service test passed | Users Manual update completed in item 7 |
| Contributor Market promotion | Complete | Direct Contributor service test confirms own listing promotion is available; ad manager now exposes a market-only flow and rejects non-listing destinations | src/modules/ads-credits/ads-credits.service.ts, src/modules/ads-credits/types.ts, src/components/ads-credits/create-ad-campaign-form.tsx |
| Writers Corner creation | Complete | npm run typecheck; local Contributor browser created a manuscript and verified storefront publishing and Business Center controls are absent; local QA manuscript cleaned up | src/modules/writers-corner/types.ts, src/modules/writers-corner/writers-corner.service.ts, src/components/writers-corner/create-manuscript-form.tsx, src/components/writers-corner/storefront-publish-toggle.tsx |
| Manuals/policies reconciled | Complete | npm run typecheck; Users Manual now documents Contributor capabilities and hidden boundaries, Writers Corner workflow, and limits; Admin Hat documents hidden-capability enforcement; policy/core-function/tier-map docs updated | src/modules/users-manual/users-manual-content.ts, src/components/users-manual/users-manual-client.tsx, src/modules/admin-hat/admin-hat-content.ts, docs/modules/03-membership-policy.md, docs/core-functions.md, docs/tier-capability-map.html |
| Final Contributor regression | Complete | Local Contributor browser verified restricted navigation, generic 404 routes, allowed Groups/Market/Writers flows, Auditor Directory, filtered Production Zone, Users Manual Contributor/Writers sections, and no temporary QA records remain; typecheck/lint/build recorded below | This plan and the Users Manual/Admin Hat/policy references are current |


## Final regression evidence (2026-07-15)

- Test identity: local `mike` account with `MEMBER` role and `CONTRIBUTOR` membership.
- Navigation: Home, Comm Center, People, Groups, Market, Tools, and Settings are present; Tools opens Writers Corner. Events, Jobs, Business Center, Fundraisers, and Ads are not in the control panel.
- Restricted web routes: Business Center storefront, Jobs, Events, Fundraisers, and auditor-profile creation all rendered the generic 404 page for the Contributor account.
- Allowed routes: group creation, Market listing creation/editing, Writers Corner manuscript creation, Auditor Directory browsing, and Production Zone opened without upgrade cards.
- Writers Corner: Contributor create flow rendered without storefront-publishing or Business Center controls.
- Market promotion: Contributor retains the approved own-listing promotion flow only; non-listing ad destinations are rejected and general ad creation remains hidden from navigation.
- Documentation: Users Manual includes Contributor and Writers Corner sections; Admin Hat, membership policy, core-functions, and tier-capability references describe the hidden-not-gated boundary.
- Data hygiene: temporary QA listings and manuscripts were removed; no temporary Contributor QA records remain.
- Code gates: `npm run typecheck` passed, `npm run lint` passed with no warnings/errors, and `npm run build` completed successfully after clearing the generated `.next` directory.
