# Alpha UX + Cross-Tier Feature Test

Run date: 2026-07-02
Target: https://theta-space.net
Marker: Alpha Test Run - 2026-07-02
Identifier: TS-ALPHA-20260702

## 1. Executive Summary

Overall confidence: Medium-Low.

The site is not ready for a broad human alpha run yet. Contributor listing creation works, but the Market media upload path fails against Cloudflare R2 CORS, group creation crashes, and the Auditor tier does not expose an obvious audit/review workflow for Contributor content. Event creation is currently gated/unavailable for the Contributor account tested.

Contributor-to-Free interaction was not completed. The available Free test account (`john`) was inside onboarding, and the site owner instructed this run to ignore onboarding rather than continue treating it as the central blocker.

Permissions looked mostly safe in the tested reachable paths. Auditor `jules` could not access `/admin`; `/admin` redirected to normal home. Auditor could view Contributor-created Market listings but did not receive owner management controls in the final clean verification.

Biggest risks before human alpha:

- Group creation is a hard failure: API returns 500 and the page throws a client-side exception.
- Market image uploads fail because the R2 presigned upload is blocked by CORS.
- The listing detail layout uses a very large mostly empty hero area, pushing useful listing content below the fold.
- Auditor tier purpose is unclear; no audit queue, review controls, audit notes, or request-change workflow was found in the tested routes.

## 2. Accounts and Browsers Used

| Tier | Browser | Account | Result |
|---|---|---|---|
| Contributor | Microsoft Edge | `mike` | Login worked. Profile previously identified as `CONTRIBUTOR MEMBERS`. Created Market listings. |
| Auditor | Microsoft Edge | `jules` | Login worked. Profile identified as `AUDITOR MEMBERS`. Could view listing and auditor directory, but no review workflow surfaced. |
| Free | Firefox | `john` | Login worked but remained in onboarding. Per owner instruction, onboarding was ignored and Free cross-tier actions were not completed. |

## 3. Created Test Data Inventory

| Type | Title/Name | Created By | URL/ID | Status | Cleanup Needed? |
|---|---|---|---|---|---|
| Listing | TS-ALPHA-20260702 Listing: Community Knowledge Exchange | Contributor `mike` | https://theta-space.net/market/ts-alpha-20260702-listing-community-knowledge-exchange | Published | Yes |
| Listing | TS-ALPHA-20260702 Media Listing: Thumbnail Render Check | Contributor `mike` | https://theta-space.net/market/ts-alpha-20260702-media-listing-thumbnail-render-check | Published, but image upload failed | Yes |
| Group | TS-ALPHA-20260702 Group: Open Collaboration Circle | Contributor `mike` | Not created | Failed with 500/client exception | No created object found |
| Event | TS-ALPHA-20260702 Contributor Event: Intro Collaboration Session | Contributor `mike` | Not created | Feature unavailable/gated | No |
| Audit note | n/a | Auditor `jules` | n/a | No audit-note UI found | No |

## 4. Cross-Tier Results

| Created/Actioned By | Consumed/Viewed By | Feature | Expected Result | Actual Result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| Contributor | Free | Listing application | Free can view/apply; Contributor receives request | Not exercised per owner direction to ignore onboarding | Not tested | No non-onboarding Free session was used. |
| Contributor | Auditor | Listing visibility | Auditor can view public Contributor listing without owner controls | Auditor could view listing. No owner management controls observed in final verification. | Pass | Evidence: `screenshots-retry/13-auditor-listing-promotion-control.png`. |
| Contributor | Free | Group invite/join | Free can join/request group | Contributor group creation failed before Free interaction | Fail | API 500 and client exception. |
| Contributor | Free | Event registration | Free can register/request access | Contributor event creation unavailable/gated | Not tested | Event route did not present a usable create form. |
| Auditor | Contributor | Audit note/request | Contributor receives appropriate review status | No audit controls found | Fail/Product gap | Auditor tier purpose not clear in tested UI. |
| Auditor | Free | Audited listing visibility | Free sees only appropriate public status | Not exercised | Not tested | Dependent on Free session and audit workflow. |
| Free | Contributor | Application status | Contributor sees Free application/request | Not exercised | Not tested | Dependent on Free interaction. |
| Free | Auditor | Data visibility | Auditor sees only intended Free-user data | Not exercised | Not tested | No Free interaction data created. |

## 5. Bugs Found

### Bug ID: ALPHA-001

Title: Market image upload fails because R2 direct upload is blocked by CORS
Severity: High
Tier affected: Contributor
Browser: Edge
URL/page: `https://theta-space.net/market/create`
Steps to reproduce:

1. Log in as `mike`.
2. Open `/market/create`.
3. Fill a valid Market listing.
4. Attach a valid PNG.
5. Submit the listing.

Expected result: The PNG uploads, finalizes, and renders as a listing thumbnail/detail image.

Actual result: Browser console reports Cloudflare R2 CORS failure: no `Access-Control-Allow-Origin` header on presigned upload preflight. The listing still publishes, but without the image.

User impact: Users think they added media, but the listing publishes without the expected image. This directly affects Market listing quality and ad/listing previews.

Evidence/screenshots:

- `docs/alpha-qa/2026-07-02/screenshots-media-listing/01-media-listing-filled.png`
- `docs/alpha-qa/2026-07-02/screenshots-media-listing/02-media-listing-result.png`
- Raw console evidence: `docs/alpha-qa/2026-07-02/media-listing-results.json`

### Bug ID: ALPHA-002

Title: Group creation returns 500 and crashes the client page
Severity: High
Tier affected: Contributor
Browser: Edge
URL/page: `https://theta-space.net/groups/create`
Steps to reproduce:

1. Log in as `mike`.
2. Open `/groups/create`.
3. Fill group name, tagline, description, visibility, and join policy.
4. Click `Create group`.

Expected result: Group is created and the user is redirected to the group detail page.

Actual result: The API returns 500. The client then attempts `response.json()` on an empty/non-JSON response and throws: `SyntaxError: Failed to execute 'json' on 'Response': Unexpected end of JSON input`. The UI becomes the generic client-side exception page.

User impact: Core group creation is blocked and the error is not recoverable or understandable.

Evidence/screenshots:

- `docs/alpha-qa/2026-07-02/screenshots-retry/04-retry-group-form-filled.png`
- `docs/alpha-qa/2026-07-02/screenshots-retry/05-retry-group-result.png`
- Raw console evidence: `docs/alpha-qa/2026-07-02/alpha-ux-cross-tier-retry-results.json`

### Bug ID: ALPHA-003

Title: Market listing detail uses a large mostly empty hero region above useful content
Severity: Medium
Tier affected: Contributor, Auditor, any listing viewer
Browser: Edge
URL/page:

- `https://theta-space.net/market/ts-alpha-20260702-listing-community-knowledge-exchange`
- `https://theta-space.net/market/ts-alpha-20260702-media-listing-thumbnail-render-check`

Steps to reproduce:

1. Open either created listing detail page.
2. Observe the first viewport.

Expected result: The listing title, price, description, seller, and image/thumbnail should be visible or partially visible in the first viewport.

Actual result: The first viewport is dominated by a large blank/gradient hero card with only the category label. The meaningful listing details are pushed down.

User impact: Listings feel empty or broken on first load, and users must scroll to find the content they clicked for.

Evidence/screenshots:

- `docs/alpha-qa/2026-07-02/screenshots-retry/03-retry-listing-result.png`
- `docs/alpha-qa/2026-07-02/screenshots-media-listing/02-media-listing-result.png`
- `docs/alpha-qa/2026-07-02/screenshots-retry/11-retry-auditor-listing.png`

### Bug ID: ALPHA-004

Title: Event creation is unavailable/gated for Contributor during alpha flow
Severity: Medium
Tier affected: Contributor
Browser: Edge
URL/page: `https://theta-space.net/events/create`

Steps to reproduce:

1. Log in as Contributor `mike`.
2. Open `/events/create`.

Expected result: If events are part of the intended Contributor alpha scope, a usable event creation form should appear.

Actual result: The feature is unavailable/gated; no event was created.

User impact: Event workflows cannot be tested by Contributor users in this alpha pass.

Evidence/screenshots:

- `docs/alpha-qa/2026-07-02/screenshots/08-contributor-event-result.png`

### Bug ID: ALPHA-005

Title: Login/navigation frequently logs RSC payload fetch failures and feels slow
Severity: Medium
Tier affected: Contributor, Auditor, Free
Browser: Edge and Firefox
URL/page: Login to `/home`, navigation to protected pages

Steps to reproduce:

1. Log in as `mike`, `jules`, or `john`.
2. Observe page transition after login and route changes.

Expected result: Navigation should load cleanly without client-side fallback errors.

Actual result: Console repeatedly logs `Failed to fetch RSC payload ... Falling back to browser navigation`. Login/dashboard transitions commonly measured around 5 to 12 seconds in the automated pass.

User impact: The site feels unstable and slow, and route transitions can be interrupted.

Evidence:

- `docs/alpha-qa/2026-07-02/alpha-ux-cross-tier-results.json`
- `docs/alpha-qa/2026-07-02/alpha-ux-cross-tier-retry-results.json`

## 6. UX Issues

- Market listing detail layout does not put the listing content where the user expects it. The first viewport reads like an empty category splash.
- Group creation failure is generic and developer-facing. A real user gets no recovery path.
- Auditor navigation does not explain what an Auditor is supposed to do. `/auditors` shows "Find an Auditor" and "I'm an Auditor", but no queue, review, audit note, flag, approval, or history workflow surfaced.
- Business/ads and Market UI are visually consistent, but the first-viewport information hierarchy on listing detail needs tightening.
- Top navigation icons are visually improved compared with earlier screenshots, but the report did not perform a full cross-page visual polish sweep; that is covered separately in `docs/visual-qa/2026-07-02/desktop-visual-qa-backlog.md`.

## 7. Performance Notes

| Page/Flow | Browser | Tier | Approx Load Time | UX Quality | Issues Found |
|---|---|---|---:|---|---|
| Login to dashboard | Edge | Contributor | ~12.2s on retry | Poor | RSC fallback error, slow transition |
| Profile page | Edge | Contributor | ~5.9s | Acceptable after load | Heavy page, but rendered |
| Settings page | Edge | Contributor | ~2.8s | Acceptable | No major blocker |
| Listing creation submit | Edge | Contributor | ~10.3s | Acceptable when no media | Success, but slow |
| Listing media upload/submit | Edge | Contributor | ~10s+ | Poor | R2 CORS failure; listing publishes without image |
| Group creation submit | Edge | Contributor | ~8-9s | Broken | 500 plus client exception |
| Auditor login | Edge | Auditor | ~9.2s | Slow | RSC fallback error |
| Auditor listing detail | Edge | Auditor | ~6.4s combined listing/group check | Mixed | Detail layout sparse above fold |

## 8. Permission and Security Notes

- Auditor `jules` could not access `/admin`; the route redirected to `/home`. This passed the tested admin boundary.
- Auditor could view Contributor-owned public Market listings. That is expected for public listing visibility.
- In final clean verification, Auditor did not see a `Create listing ad` button on Contributor-owned listing. No ad-destination permission leak was confirmed in this run.
- Free-tier permission boundaries were not fully tested because the owner instructed the run to ignore onboarding, and no alternate non-onboarding Free session was used.
- No destructive actions were tested. No real user content was deleted or modified.

## 9. Recommended Fixes Before Human Alpha Test

Must fix before human alpha:

- Fix R2 bucket CORS for direct presigned uploads from `https://theta-space.net`.
- Fix `/api/groups` 500 and make the client handle non-JSON errors without crashing.
- Add a visible, recoverable error state for failed uploads and failed group creation.

Should fix soon:

- Rework Market listing detail first viewport so title/price/seller/description/media are visible without a large empty hero.
- Clarify or implement Auditor workflows: audit queue, content review, audit note, request changes, review history, and what is visible to Contributor/Free users.
- Reduce login/navigation latency and investigate repeated RSC payload fetch fallback errors.
- Decide whether Contributor event creation should be enabled for alpha; if not, hide or label the route more explicitly.

Nice to fix:

- Add in-page timing or loading hints for long form submits.
- Add cleanup/admin tooling for alpha test artifacts by marker (`TS-ALPHA-20260702`).
- Improve first-run test account readiness so QA does not start in onboarding unless onboarding itself is the target.

## 10. Confidence Level

Confidence: Medium-Low.

The reachable Contributor and Auditor paths were exercised with real production browser sessions and screenshots. However, the requested Free-tier cross-tier interaction flow was not completed because the available Free account was in onboarding and the owner instructed the run to ignore onboarding. Because of that, the most important Contributor-to-Free and Auditor-to-Free matrix rows remain unverified.

Raw evidence:

- `docs/alpha-qa/2026-07-02/alpha-ux-cross-tier-results.json`
- `docs/alpha-qa/2026-07-02/alpha-ux-cross-tier-retry-results.json`
- `docs/alpha-qa/2026-07-02/media-listing-results.json`
- `docs/alpha-qa/2026-07-02/free-skip-final-results.json`
- Screenshots under `docs/alpha-qa/2026-07-02/screenshots*`
