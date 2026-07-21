# Free, Contributor, and Administrator Release QA Audit

Audit date: July 21, 2026
Target: `https://theta-space.net` and matching `main` source
Scope: Free Tier, Contributor Tier, and current Administrator functions
Audit rule: document defects and suspected causes; do not repair them during this pass

## Release Objectives

1. Free members can easily use every Free feature without upgrade gates or misleading unavailable controls.
2. Administrators can designate Free members as eligible for Contributor.
3. Eligible Free members can see and complete a Contributor upgrade.
4. Contributor access is free during beta, while clearly disclosing the future price of `$4.99/month`.
5. Contributor members receive every operational Contributor feature.
6. Current Administrator tools are discoverable, authorized, understandable, and functional.
7. Professional, Auditor, Org, unavailable business creation, and other non-operational features remain hidden.
8. User-facing workflows avoid raw errors, dead ends, ambiguous gates, clipping, overflow, and unexpected permission failures.

## Severity

| Severity | Meaning |
|---|---|
| S0 | Security, financial, privacy, or destructive-data release blocker |
| S1 | Core role/tier workflow broken or a user receives incorrect authorization |
| S2 | Feature works incompletely, produces a dead end, or has serious usability friction |
| S3 | Minor presentation, copy, consistency, or accessibility problem |

## Evidence Standard

Every failed or questionable test records:

- exact role and membership tier;
- route and action;
- viewport/theme when relevant;
- expected and actual result;
- reproducible steps;
- likely cause;
- probable source files, service, or data condition;
- focused next repair action.

## Environment Record

| Item | Value |
|---|---|
| Production URL | `https://theta-space.net` |
| Source repository | `C:\Repos\Theta-Space-net\NewRepo` |
| Source branch | `main` |
| Starting source commit | `8206da0` |
| Desktop browser/viewport | Authenticated production browser, nominal `1280px` desktop viewport |
| Narrow viewport | Authenticated production browser at `390 x 844` CSS pixels |
| Themes | Dark and light inspected where recorded below |
| Free test identities | `qa_free_621725` and isolated comparison account `qa_free_b_688963` |
| Contributor test identity | `qa_contrib_669833` |
| Administrator identity | Existing `admin` account; credentials intentionally excluded |

## Authenticated Live QA Record

The following production workflows were executed with isolated QA identities. The accounts and clearly labeled QA content remain available for defect reproduction. No application code was changed during this audit.

### Free and onboarding workflows

- Administrator account creation worked, but its membership selector offered disabled Professional and Auditor tiers as well as Free and Contributor.
- Full Free onboarding, profile details, Scientology details, attestation, Terms link/PDF access, Terms acceptance, activation, and first-login tutorial prompt completed successfully.
- Live city and Org/AO search returned selections. City suggestions took approximately `2.7s`, which is usable but perceptibly slow.
- Text Stream post, self reply, public Stream picture upload, gallery upload, and a gallery visibility change from Private to Members/comments completed successfully.
- My Pics correctly excluded the Stream/ad upload from the personal gallery count while retaining the dedicated gallery upload.
- Setting that gallery picture as the avatar caused a full client-side application crash. The avatar was not applied.
- The Free home Stream visibly exposed `Latest`, `Friends`, `Groups`, and `Pics` filters even though current Free policy says those filters are not available.
- A newly created post remained visible on Home, but the same member's own profile displayed `Nothing in this stream yet`.
- A public Stream post was labeled `MEMBERS`, and the composer exposed no audience selector. This conflicts with the stated public-Stream policy and needs a data/audience-contract review.
- Free Market creation, editing, three-picture upload, and explicit carousel enablement worked. Once enabled, the carousel auto-advanced at approximately three seconds and manual arrows/dots worked.
- `My Listings` listed the member's entries and its `EDIT` action opened the prefilled edit form successfully.
- Production still offered `3 of 3 listings left this 14-day period`, then `2 of 3` after the first listing. The approved Free policy is one active personal listing at a time.
- With the carousel disabled, three listing images rendered as a tall single-column stack rather than a compact side-by-side or carousel presentation.
- Free group creation, a second member joining, forum topic creation, forum reaction, photo reply, and creator moderation controls all completed successfully.
- A group forum row rendered a mojibake separator between `0 REPLIES` and `PHOTO REPLIES ALLOWED`; `Create Forum` also labels an action that actually creates a topic/thread.
- Free subscription display showed only the current Free plan and `200 MB`, with no higher-tier choices.

### Cross-account and Contributor workflows

- Free-to-Contributor direct text and picture messages completed successfully.
- The Contributor recipient reacted to the message, used normal reply, and used quote/reply successfully; reply context remained attached to the correct message.
- The attachment indicator remained at `0%` before Send even though the picture sent successfully; unread notification/chat badges updated correctly afterward.
- Writers Corner manuscript creation and two chapter creations completed successfully. A Free member subscribed, and a subsequent chapter generated a notification for that subscriber.
- Subscriber count remained stale until reload. The new-chapter notification contained the event text but no link to the manuscript/chapter.
- Contributor subscription display showed only the current Contributor plan and `2 GB` storage.
- Contributor Settings did not expose Feedback Center/support, despite the Contributor entitlement and source route intending it to be available.
- Contributor visibly received Business Center, Storefront management, storefront publishing controls, and Writers Corner storefront-publishing controls. Current policy reserves storefront/business creation for later tiers, so this is an entitlement leak rather than a merely gated card.
- The same mismatch was confirmed with temporary access: navigation hid `Tools`, yet a direct visit to `/business-center` loaded Storefront and Writers Corner creation controls.
- At `390 x 844`, the Contributor document measured approximately `574px` wide. Control-panel items and reaction popovers extended beyond the viewport.

### Eligibility and Administrator workflows

- Launch-access administration defaulted to a global scope, offered Contributor and disabled Professional, and had no visible revoke/edit action.
- An isolated grant to `qa_free_b_688963` produced `YOUR PLAN: Free` and `ACCESS AVAILABLE NOW: Contributor`, showed `2 GB`, and displayed promotional access through `1/21/2027`.
- That granted member had no self-upgrade/activation action and saw no explanation that beta access is free now and will cost `$4.99/month` later. This is temporary access, not the requested admin-designated upgrade offer.
- Founder pricing displayed Contributor at `$1.99` founder / `$4.99` standard and also showed disabled-tier pricing. It did not present the required free-beta offer.
- Reports Queue loaded empty and read-only; no resolution/moderation workflow was present.
- Feature Flags rendered as an uncategorized free-text key plus a checkbox. It listed no known flags, categories, descriptions, effective values, or group switches, so an administrator cannot safely understand or operate it.
- At a `390px` viewport, the Administrator document measured approximately `800px` wide, leaving major controls off-screen.

### Live responsive and visual evidence

- At `390 x 844`, Free/Contributor pages measured approximately `574px` wide and used a horizontally overflowing control-panel row. `Groups`, `Market`, `Settings`, and `Logout` progressively extended off-screen.
- Mobile navigation did not provide the desktop-only secondary destinations such as My Pics, Search, Notifications, Alerts, Jobs, Auditor Directory, and other section children.
- Desktop profile content showed an approximately `8px` clipped horizontal overflow inside `main.main-surface` (`700px` client width versus `708px` scroll width with `overflow-x: hidden`).
- Computed theme checks identified weak gold-on-gold pill contrast in dark mode (approximately `1.48:1`) and avatar-initial contrast as low as approximately `1.45:1` in light mode. Gradient/transparency makes these computed values approximate, but the visual risk is clear.
- Screenshot capture repeatedly timed out in the browser-control layer. Geometry, rendered text/state, viewport measurements, and interaction results above came from the live page DOM; the screenshot-tool timeout is not recorded as a Theta-Space defect.

### Retained reproduction references

| Artifact | Reference |
|---|---|
| Free identity | `qa_free_621725` |
| Contributor identity | `qa_contrib_669833` |
| Temporary-access comparison identity | `qa_free_b_688963` |
| Avatar-crash gallery asset | `cmrujy5x700eek51nor5loouq` |
| Cross-account group | `/groups/qa-621725-free-interaction-group` |
| Group forum topic | `cmrukpd2500j7k51nxib0ibmg` |
| Contributor manuscript | `/writers-corner/qa-qa-contrib-669833-beta-readiness-manuscript` |
| Manuscript chapters | `cmrul05ov00lrk51n82z65eek`, `cmrul3aw400n8k51nr5j114em` |
| Direct-message reaction/reply anchor | `chat-message-cmrul6ltl00ofk51nasfjvbt8` |

Passwords and administrator credentials are intentionally excluded from this record.

## Free Tier Matrix

| ID | Area | Test | Result | Evidence/notes |
|---|---|---|---|---|
| F-001 | Authentication | Sign in, restore the session, logout, and return without a raw error | Partial live pass | Account creation, onboarding, activation, login, and logout completed without a site error. Long-lived session restoration/mobile-session persistence was not re-executed in this pass. |
| F-002 | Navigation | Control panel exposes usable Free areas and hides unavailable tiers/business creation | Fail - live | Desktop top/secondary navigation hides several unavailable areas, but Free still sees disallowed Stream filters. At `390px`, the horizontal control panel extends off-screen and its unrendered child links make several valid destinations undiscoverable. See `LIVE-002`, `LIVE-005`, and `LIVE-006`. |
| F-003 | Stream | Open chronological public Stream and create a text post | Partial live pass | A text post and self reply were created. The rendered `MEMBERS` audience badge conflicts with the required public Stream behavior, and the composer offers no audience control. See `LIVE-004`. |
| F-004 | Stream media | Create a Stream post with a public picture using the complete R2 flow | Pass - live | Phone-style/public Stream image upload completed through the production upload flow and rendered on Home. |
| F-005 | Stream interaction | React, comment, reply, quote reply, and share | Partial live pass | Self reply worked. Full Stream reaction/share variants were not conclusively completed; direct-message reaction, reply, and quote reply were proven separately in `F-010`. |
| F-006 | Profile | View and edit the personal profile; another member can see allowed fields | Fail - live | Onboarding/profile data saved and rendered, but the member's own profile said `Nothing in this stream yet` while that member's new posts were visible on Home. See `LIVE-003`. |
| F-007 | Gallery | Upload, view, change visibility, comment, and set avatar/banner | Fail - live | Upload and visibility change passed. `Set as avatar` caused a full client-side exception and did not apply the avatar. See `LIVE-001`. |
| F-008 | People | Search members, open profiles, and use supported connection/family actions | Not run | |
| F-009 | Groups | Browse, create/join, post, upload media, and use creator moderation | Pass - live | Free created a group/topic; Contributor joined, reacted, and posted a photo reply; Free creator moderation controls were present and usable. Copy/encoding defects remain (`LIVE-010`). |
| F-010 | Comm Center | Start/open a thread; send, react, reply, quote reply, and send a picture | Pass - live | Cross-account text and picture sending, reaction, normal reply, and quote/reply all completed and preserved the correct message context. |
| F-011 | Market browse | Browse/search listings and open listing/seller actions | Fail - live | A non-owner Contributor viewing the Free listing still saw `Promotion` / `Create listing ad`; the action is not confined to an entitled listing owner. See `TIER-005`. |
| F-012 | Market create | Create/edit one active listing with no more than three photos | Fail - live | Creation/editing and three photos passed, but production still allowed three listings per 14-day period instead of one active personal listing. Multi-image layout is an oversized vertical stack unless the seller manually enables carousel. See `LIVE-007` and `LIVE-008`. |
| F-013 | Settings/help | Tutorial, Users Manual, Progression Path, profile, security, and subscription display work | Fail - live/content | Subscription truthfully showed Free and `200 MB` only. The Users Manual and live Market both retain the superseded three-listing allowance instead of the approved one-active-listing policy. See `TIER-011`. Other help workflows were not exhaustively repeated. |
| F-014 | Tier restrictions | No support-request creation, business identity, events, auditor creation, or higher hidden tiers leak | Fail - live | Feedback/support remained hidden as intended for Free, but disallowed Stream filters and listing-promotion controls leaked. Direct-route entitlement inconsistency was proven with a temporarily granted account. |
| F-015 | Membership | Ineligible Free member sees only truthful current membership information | Pass - live | The ordinary Free subscription view showed only Free, `200 MB`, and no higher plan choices. The designated-access comparison is recorded in `C-001` through `C-004`. |
| F-016 | Responsive/theme | Primary Free workflows have no clipping/overflow in light/dark desktop and narrow layouts | Fail - live | At `390px`, the document measured about `574px`; navigation/actions extended off-screen. Desktop had clipped inner overflow and both themes had low-contrast pill/avatar combinations. See `LIVE-005` and `LIVE-006`. |

## Contributor Eligibility and Upgrade Matrix

| ID | Area | Test | Result | Evidence/notes |
|---|---|---|---|---|
| C-001 | Admin designation | Admin can grant Contributor upgrade eligibility to a selected Free account | Fail - live | Launch Access granted temporary Contributor capabilities to `qa_free_b_688963`; it did not create an upgrade offer. The tool defaults global, offers disabled Professional, and has no revoke/edit action. See `TIER-003` and `TIER-010`. |
| C-002 | Eligibility visibility | Only an eligible Free member sees the Contributor upgrade path | Fail - live | The granted member saw `YOUR PLAN: Free` and `ACCESS AVAILABLE NOW: Contributor` through `1/21/2027`, but no upgrade/activation action. This is immediate promotional access, not a designated upgrade path. See `TIER-001` and `LIVE-014`. |
| C-003 | Upgrade completion | Eligible Free member can upgrade without a broken checkout or unavailable gate | Fail - live | No self-upgrade control existed after the isolated grant. Existing code still exposes a paid checkout contract rather than a zero-charge beta activation. See `TIER-001`, `TIER-002`, `TIER-003`, and `TIER-004`. |
| C-004 | Beta disclosure | Upgrade UI says Contributor is free for beta testers and will cost `$4.99/month` in the future | Fail - live | No beta-free/future-`$4.99` disclosure appeared. Founder pricing instead showed `$1.99` founder / `$4.99` standard, alongside disabled-tier pricing. See `TIER-004` and `LIVE-015`. |
| C-005 | Persistence | Contributor tier persists across refresh, logout/login, web session, and mobile session contract | Partial live pass | The permanent Contributor identity and temporary-access identity both retained their displayed state across page reloads during the session. Full logout/login and native mobile persistence were not repeated. |
| C-006 | Entitlements | Contributor receives all Free features plus every operational Contributor entitlement | Fail - live/static | Writers Corner, 2 GB display, messaging, and group interactions worked. Support was missing, advertised promotion credits are not allocated, and temporary access produces inconsistent navigation versus direct-route capabilities. See `TIER-006`, `TIER-007`, `LIVE-012`, and `LIVE-013`. |
| C-007 | Hidden tiers | Professional, Auditor, Org, and unavailable business creation remain hidden | Fail - live | Professional/Auditor/Org stayed absent from ordinary member subscription, but Contributor received storefront/business creation and direct `/business-center` exposed it even when Tools was hidden. Admin grant/pricing screens also exposed disabled tiers. See `LIVE-011`, `LIVE-013`, `ADM-002`, and `ADM-005`. |
| C-008 | Responsive/theme | Contributor upgrade and feature UI have no clipping/overflow in light/dark and narrow layouts | Fail - live | At `390 x 844`, Contributor pages measured approximately `574px` wide; control-panel destinations and reaction controls extended beyond the viewport. See `LIVE-005`. |

## Contributor Feature Matrix

| ID | Area | Test | Result | Evidence/notes |
|---|---|---|---|---|
| CF-001 | Writers Corner | Open Writers Corner and create a manuscript | Pass - live | Contributor created and opened a production manuscript successfully. |
| CF-002 | Manuscript content | Create substantial multi-chapter content without the former 800-character limitation | Partial live pass | Two chapters (approximately 125 and 46 words) saved and rendered. Multi-chapter behavior passed, but this pass did not exercise a body longer than 800 characters/500 words per chapter. |
| CF-003 | Reader subscription | Another member can subscribe and receive a new-chapter notification | Partial live pass | Free subscribed and received the next-chapter notification. Subscriber count required reload, and the notification did not link to the chapter. See `LIVE-009`. |
| CF-004 | Storage | Contributor storage display and enforcement match policy | Partial live pass | Contributor subscription showed only Contributor and `2 GB`. Storage-limit enforcement at the boundary was not exercised. |
| CF-005 | Market | Contributor listing allowance and photo cap match policy | Fail - static code | Personal Market access exists, but ten monthly promotion credits are not allocated. Listing/photo-limit enforcement still requires browser/API execution. See `TIER-006`. |
| CF-006 | Stream controls | Operational Contributor Stream controls are visible and work | Fail - live/static | Permanent Contributor displayed filters, but temporary Contributor navigation/controls diverged because some checks use stored tier rather than effective access. The entitlement name still does not match implemented behavior. See `TIER-007` and `TIER-009`. |
| CF-007 | Support | Contributor can open and submit a support request | Fail - live | Contributor Settings did not contain Feedback Center/support, so the entitled workflow was undiscoverable and could not be submitted. See `LIVE-012`. |
| CF-008 | Tier isolation | Contributor does not gain storefront, business identity, auditor creation, jobs, or disabled-tier tools | Fail - live | Contributor loaded Business Center, Storefront controls, and storefront-publishing controls. A temporary grant hid Tools but direct `/business-center` still loaded the same tools. See `LIVE-011` and `LIVE-013`. |

## Administrator Matrix

| ID | Area | Test | Result | Evidence/notes |
|---|---|---|---|---|
| A-001 | Authorization | Admin routes reject ordinary members and load for an Administrator | Static partial; live pending | Binary `MEMBER` versus `ADMIN`/`GOD` guards exist, but service-level enforcement is inconsistent and no granular permissions or target-role hierarchy exists. See `ADM-001` and `ADM-013`. |
| A-002 | Admin navigation | Admin hub clearly exposes every operational tool without dead cards | Fail - live | Account creation, Launch Access, Founder Pricing, Reports, and Feature Flags exposed disabled, incomplete, or unsafe controls. Professional/Auditor were selectable during account creation and Professional was offered by Launch Access. See `ADM-002`, `ADM-005`, `ADM-012`, and `LIVE-017`. |
| A-003 | Account search | Find an account and inspect its current state accurately | Partial live pass | Isolated accounts could be located for membership/launch operations and the resulting member state was observable. The complete support/account-state surface was not exhaustively tested. |
| A-004 | Membership | Change Free/Contributor status with an audit reason | Partial live pass | Admin could create/select the relevant membership state, but the only designation tested was temporary Launch Access rather than an eligibility offer. Audit atomicity remains a source blocker. See `TIER-003` and `ADM-009`. |
| A-005 | Contributor eligibility | Grant and revoke Contributor upgrade eligibility | Fail - live | Launch Access immediately changed effective access, defaulted global, and exposed no revoke/edit action. The member still had no self-upgrade control. See `TIER-003`, `TIER-010`, and `LIVE-014`. |
| A-006 | Account safety | Suspend/restore and delete confirmation flows are understandable and protected | Fail - static code | Target-role hierarchy is missing, and permanent deletion does not remove all owned content/media/R2 objects while reporting zero cleanup failures. See `ADM-001` and `ADM-007`. UI confirmation remains untested. |
| A-007 | Invite authority | Grant/revoke invite creation and bulk-invite authority | Fail - static code | Role-target controls can appear actionable and then fail, while invite revocation does not effectively constrain privileged-role bypass. See `ADM-010`. |
| A-008 | Bulk invitations | Parse a mixed email list, create unique invitations, queue safely, and expose truthful status | Not run | |
| A-009 | Announcements | Create, locate, and dismiss/remove an announcement using admin tools | Fail - static code | Fan-out silently caps active recipients at 1,000 and runs sequentially without an outbox/transaction, so partial completion is possible. See `ADM-011`. |
| A-010 | Moderation | Review reports, restrictions, held posts, and moderation audit records | Fail - live/static | Reports Queue loaded empty and read-only; no resolve/restrict/hold actions were available. Administrative history remains too shallow for reliable investigation. See `ADM-003`, `ADM-012`, `ADM-014`, and `LIVE-016`. |
| A-011 | Thread preservation | Locate, hold, export, and import a post thread according to policy | Not run | |
| A-012 | Feature flags | Understand effective state, toggle a feature/group safely, and see the audit result | Fail - live | The page was an uncategorized free-text key plus checkbox, with no listed flags, categories, descriptions, effective values, group switches, or safe impact preview. See `LIVE-017`. |
| A-013 | Platform schedules | View and control implemented scheduled maintenance/storage functions | Not run | |
| A-014 | Storage operations | Review storage policy/status without exposing secrets or raw provider errors | Not run | |
| A-015 | Billing view | Stripe/billing administration is truthful, safe, and does not activate disabled tiers | Fail - static security/code | Stripe secrets are stored as plaintext application data and any `ADMIN` can replace them without step-up authentication. Credit adjustments are race-prone and lack idempotency/atomic non-negative enforcement. See `ADM-006` and `ADM-008`. |
| A-016 | Audit logs | Administrative actions produce searchable actor/target/reason/timestamp records | Fail - static code | Audit recording is optional and often non-atomic; the portal exposes only a small recent slice and lacks practical history/search/export. See `ADM-009` and `ADM-014`. |
| A-017 | Admin Hat | Administrator manual opens, floats/resizes, and links to current tools | Fail - static content | Manual/help copy references disabled tiers and report actions that do not exist. Floating, resizing, links, and clipping remain pending live browser checks. See `ADM-012`. |
| A-018 | Destructive controls | DELETE-password protection and immutable/vital-record rules are consistently enforced | Fail - static code | Current deletion does not prove full owned-data cleanup or consistent preservation of vital records, and the cleanup result can report success without provider cleanup. See `ADM-007`. |
| A-019 | Responsive/theme | Current admin tools avoid clipped controls, hidden submit actions, and unusable narrow layouts | Fail - live | At `390px`, an Administrator page measured approximately `800px` wide and left major controls off-screen. See `LIVE-018`. |

## Defect and Risk Log

Status note: `TIER-*` and `ADM-*` findings originated in source inspection and are annotated below where production reproduced them. `LIVE-*` findings were observed directly in authenticated production workflows. No application code was changed during this audit.

### Tier, Eligibility, and Member Experience Findings

| ID | Severity | Affected tests | Finding | Likely cause / probable source | Focused repair target |
|---|---|---|---|---|---|
| TIER-001 | S1 | C-002, C-003 | There is no member-visible Free-to-Contributor upgrade path. **Reproduced live:** a temporary-access recipient saw access details but no activation/upgrade action. | Subscription page/detail UI does not request or render available plans; the existing checkout-button component has no reachable caller. | Add an eligibility-aware upgrade card and an end-to-end route test; keep it absent for ineligible members. |
| TIER-002 | S1 | C-001, C-002, C-003 | Contributor checkout is not limited to accounts designated by an administrator. | Checkout API/service checks general plan availability and Stripe state; the eligibility model is used for Org rather than Contributor. | Define Contributor eligibility as a server-enforced prerequisite and reject direct API calls from ineligible accounts. |
| TIER-003 | S1 | C-001, A-004, A-005 | Existing admin controls do not grant Contributor upgrade eligibility. **Reproduced live:** Launch Access immediately produced temporary access through `1/21/2027`. | Membership correction changes the permanent tier immediately; launch-access grants temporary policy access. Neither writes a distinct Contributor offer/eligibility record. | Add explicit grant/revoke eligibility actions with actor, reason, expiry, and audit history. |
| TIER-004 | S1 | C-003, C-004 | The required beta offer is absent and the only implemented checkout is paid. **Reproduced live:** Founder Pricing showed `$1.99` founder / `$4.99` standard and no free-beta disclosure. | Contributor plan configuration uses `499` cents (plus a separate `199`-cent founder price); no copy states beta access is free now and `$4.99/month` later. | Implement a zero-charge beta activation path and show the exact future-price disclosure before confirmation. |
| TIER-005 | S2 | F-011, F-014 | Listing promotion appears for an ineligible viewer. **Reproduced live:** a non-owner Contributor browsing a Free seller's listing saw `Promotion` and `Create listing ad`. | Listing detail promotion visibility is not consistently constrained to an entitled owner; ownership/entitlement/viewer checks are conflated. | Render promotion only when the current viewer owns the listing **and** has the promotion entitlement; enforce the same rule server-side. |
| TIER-006 | S1 | C-006, CF-005 | Contributor's advertised ten monthly promotion credits are never allocated. | Plan metadata describes the credits, but no activation/monthly allocation transaction was found. | Add idempotent activation and renewal allocation with ledger evidence and boundary tests. |
| TIER-007 | S2 | C-006, CF-006 | Temporarily granted Contributor members do not receive all Contributor Stream controls. | Home/Stream visibility checks the stored tier rather than effective feature access. | Centralize UI and API checks on the same effective entitlement result. |
| TIER-008 | S2 | C-005, F-015 | Promotional membership display can misstate the member's permanent plan. | Permanent and promotional cards both use the effective display name. | Render permanent tier and temporary access as separate facts with independent dates/status. |
| TIER-009 | S2 | CF-006 | `Additional Stream post types` does not match implemented behavior. | The entitlement controls Latest/Friends filtering, while the composer remains members-visible and offers no friends-only audience choice. | Rename the entitlement to implemented behavior or implement the promised audiences; add permission/UI contract tests. |
| TIER-010 | S2 | A-005, C-005 | Temporary Contributor access cannot be revoked or edited. **Reproduced live:** Launch Access defaulted global and presented no revoke/edit action. | Launch-access administration exposes read/create operations only and defaults grants to six months. | Add revoke/edit/expire operations, confirmation, and atomic audit records. |
| TIER-011 | S1 | F-012, F-013 | Production and the Users Manual both retain the superseded Free Market allowance. | Live creation said `3 of 3 listings left this 14-day period`, then `2 of 3`; manual copy also says three per 14 days. The approved policy is one active personal listing at a time. | Make one active listing the canonical server-side policy, enforce it atomically, derive all UI/manual copy from it, and regression-test direct API creation. |

### Administrator Findings

| ID | Severity | Affected tests | Finding | Likely cause / probable source | Focused repair target |
|---|---|---|---|---|---|
| ADM-001 | S0 | A-001, A-006 | An `ADMIN` can reset a `GOD` account password. | Account-support password reset checks administrator status but has no target-role hierarchy. | Enforce actor-above-target hierarchy; require Owner step-up authentication and dual confirmation for top-role recovery. |
| ADM-002 | S1 | A-002, C-007 | Disabled tiers remain visible and assignable during admin account creation. **Reproduced live:** Professional and Auditor appeared in account creation, and disabled-tier pricing appeared in Founder Pricing. | The form lists Professional/Auditor and the backend accepts all membership tiers, including Org, despite public disablement. | Limit creation/status/pricing controls to operational tiers behind one server-side allowlist. |
| ADM-003 | S2 | A-010 | Reports Queue is read-only. **Reproduced live:** the queue loaded empty with no moderation actions. | The current admin surface fetches reports but implements no resolve/restrict/hold workflow despite manual claims. | Add explicit report states/actions with permission checks, reason capture, and audit events, or make the UI/manual truthfully read-only. |
| ADM-004 | S2 | A-003, A-006 | `Personal email queued` can report success without queuing or sending mail. | The account-support email action appears to count selected addresses rather than creating an outbox job. | Use a durable outbox and show queued/sent/failed truthfully with message IDs. |
| ADM-005 | S2 | A-005 | Promotional Contributor grants default to six months and have no revoke/edit operation. **Reproduced live:** scope defaulted global, disabled Professional was offered, and the resulting expiry was `1/21/2027`. | Launch-access administration has GET/POST only and a hard/default duration. | Implement account-scoped safe defaults, explicit duration, revoke, edit, expiry, and history; align it with the future eligibility model. |
| ADM-006 | S0 | A-015, A-016 | Platform-credit adjustments are vulnerable to concurrent overwrite/retry and can violate financial correctness. | Adjustment logic lacks an idempotency key, atomic non-negative update, and strong confirmation. | Use a transactional append-only ledger, unique idempotency key, atomic balance constraint, and typed confirmation. |
| ADM-007 | S0 | A-006, A-018 | Permanent deletion does not perform or prove complete owned-data cleanup. | The service deactivates/deletes core account state but does not remove all content/media/R2 objects; `cleanupFailures` remains zero without provider cleanup. | Build an auditable deletion manifest/job, preserve protected records, retry provider cleanup, and block `complete` until verified. |
| ADM-008 | S0 | A-015 | Stripe secrets are stored as plaintext application data and every `ADMIN` can replace them without reauthentication. | Binary admin authorization protects a general settings record rather than a dedicated secrets boundary. | Move secrets to protected secret storage; restrict changes to Owner/Finance with MFA/reauth and immutable audit. |
| ADM-009 | S1 | A-004, A-010, A-016 | Administrative audit records are optional and often not atomic with the action. | Individual services decide whether/how to write audits, sometimes outside the mutation transaction. | Require one centralized audited-command wrapper or transactional outbox for every privileged mutation. |
| ADM-010 | S2 | A-007 | Unsupported controls can be clickable for `ADMIN`/`GOD` targets and then fail; invite revocation is bypassed by privileged roles. | UI and backend target rules differ, and role privilege overrides the per-account invitation grant. | Publish one capability/target-policy contract to UI and API; define whether privileged roles need explicit invite authority. |
| ADM-011 | S2 | A-009 | Announcement delivery can silently omit recipients or partially complete. | Active recipients are capped at 1,000 and processed sequentially without a durable fan-out/outbox. | Queue paginated, idempotent batches; expose recipient totals, progress, failures, retry, and cancellation. |
| ADM-012 | S3 | A-002, A-010, A-017 | Admin copy is stale. **Reproduced live:** pricing/grant screens describe disabled tiers, while Reports exposes no actions described by the manual. | Manual/navigation text references disabled tiers and report-management actions that are not implemented. | Generate help links/capabilities from the operational feature registry and test for dead/manual-only actions. |
| ADM-013 | S1 | A-001 | Service-level administrator authorization is inconsistent. | Some services rely on route guards while others perform their own broad role checks. | Require granular permission enforcement inside every privileged service, independent of the caller route. |
| ADM-014 | S2 | A-010, A-016 | Audit and diagnostic history is too shallow to investigate incidents. | Portal views expose only a small recent slice (for example, 12 audit/diagnostic items and reports capped around 100) with no practical search/export. | Add paginated filters, actor/target/action/time search, retention controls, and authorized export. |
| ADM-015 | S2 | A-001 through A-018 | There is no automated administrator authorization/action test suite sufficient for release confidence. | Privileged flows have broad role coupling and little role-target matrix coverage. | Add service/API tests for every permission, target hierarchy, destructive action, audit event, and denial path before beta administration. |
| ADM-016 | S2 | A-012 | Feature Flags is not an operable feature-control surface. **Reproduced live:** it listed no known flags and provided only a free-text key plus checkbox. | The page lacks a canonical flag registry, categories, descriptions, effective-state resolution, grouped switches, dependency warnings, and discoverable audit results. | Render the canonical registry by category, show effective versus overridden state and impact, add group switches with confirmation, and audit every mutation. |

### Authenticated Production Findings

| ID | Severity | Affected tests | Reproduction and actual result | Likely cause / probable source | Focused repair target |
|---|---|---|---|---|---|
| LIVE-001 | S1 | F-007 | As Free, upload a personal gallery picture, change visibility to Members/comments, open it, then select `Set as avatar`. The page crashes to the global client-side application-error screen and the avatar is not applied. | Gallery `use as avatar` client mutation/error handling or the server-side photo/asset resolver is returning an unhandled shape/error. | Reproduce with the retained QA asset, capture server/client trace, fix the underlying asset ownership/visibility contract, and add personal/business gallery regression tests. |
| LIVE-002 | S2 | F-002, F-014 | Free Home renders `Latest`, `Friends`, `Groups`, and `Pics` Stream filters despite the current Free policy removing these controls. | Stream filter rendering uses general membership/authentication rather than the canonical tier capability. | Drive filter rendering and API acceptance from one effective entitlement; test Free absence and Contributor presence. |
| LIVE-003 | S2 | F-006 | A Free member's new posts appear on Home, while that same member's own profile says `Nothing in this stream yet`. | Profile Stream query likely uses a different identity/audience predicate than Home, or fails to join the newly created personal author identity. | Compare Home/profile query predicates and author identity IDs; add immediate-post profile visibility tests. |
| LIVE-004 | S1 | F-003, F-004 | Main Stream posts render a `MEMBERS` badge, and Communicate exposes no audience selector even though the declared Stream policy is public. | Composer/default audience and display badge appear to use a members-only visibility constant or legacy policy. | Decide and encode the canonical public audience server-side, migrate/label existing data truthfully, and add end-to-end audience/privacy tests. |
| LIVE-005 | S1 | F-002, F-016, C-008 | At `390 x 844`, Free and Contributor documents are about `574px` wide; the horizontal control panel and reaction popovers extend off-screen. | Fixed/minimum widths, non-wrapping navigation, and oversized popover width are not bounded by the visual viewport. | Remove fixed minimums, use responsive wrapping/drawer navigation, cap overlays to viewport, and test `320/360/390/412px` widths. |
| LIVE-006 | S3 | F-016 | Desktop profile has about `8px` clipped inner overflow; dark gold-on-gold pills calculate near `1.48:1`, and light avatar initials as low as about `1.45:1`. | Nested width/padding math plus theme token pairs that do not meet text/icon contrast targets. | Correct box sizing/overflow and introduce tested semantic contrast tokens for both themes. |
| LIVE-007 | S1 | F-012, F-013 | Free Market says `3 of 3 listings left this 14-day period`, then `2 of 3` after creating one. Approved policy is one active personal listing at a time. | Production limit and documentation still use the superseded rolling three-listing policy. | Enforce a server-side active-count limit of one, align all copy/manuals, and test concurrent/direct API attempts. |
| LIVE-008 | S2 | F-012 | A three-picture listing renders three large images in a tall vertical stack until the seller explicitly enables carousel. | Multi-image detail defaults to independent full-size blocks instead of a compact multi-image renderer. | Default multi-image listings to the carousel or a compact side-by-side layout and retain clear seller timing/direction copy. |
| LIVE-009 | S2 | CF-003 | After Free subscribes to a manuscript, the count remains stale until reload. The next-chapter notification arrives but contains no link to open the manuscript/chapter. | Mutation cache invalidation is missing, and the notification payload/rendering lacks a target URL/action. | Invalidate subscriber state after mutation and require a typed chapter target in notification creation/rendering. |
| LIVE-010 | S3 | F-009 | Group forum copy contains a mojibake separator between reply count and photo policy, and `Create Forum` actually creates a topic/thread. | Mis-decoded punctuation plus terminology copied from the forum container rather than the topic action. | Normalize UTF-8 output and rename the action to `Create topic` or `Start discussion`. |
| LIVE-011 | S1 | C-006, C-007, CF-008 | Permanent Contributor can open Business Center and sees Storefront management and storefront-publishing controls. Current tier policy reserves business/storefront creation for later tiers. | Business route/navigation/components still grant access from legacy Contributor entitlements. | Remove Contributor from every business/storefront create/manage capability while retaining public storefront browsing; add route/API/UI denial matrices. |
| LIVE-012 | S2 | C-006, CF-007 | Contributor Settings contains no Feedback Center/support entry, so the entitled support-request workflow is not discoverable. | Navigation child items are not rendered and/or the production feature flag disables the route independently of entitlement. | Make Contributor support availability explicit in the effective capability response and expose a working Settings entry when enabled. |
| LIVE-013 | S1 | C-006, C-007, CF-008 | Temporary Contributor access hides `Tools`, but direct `/business-center` loads Storefront and Writers Corner controls. | Navigation uses stored tier while the direct route uses effective promotional access; business access is also over-broad. | Centralize stored/effective tier resolution and apply identical capability checks in navigation, page loaders, services, and APIs. |
| LIVE-014 | S1 | C-001, C-002, C-003, A-005 | Admin grant to `qa_free_b_688963` yields `YOUR PLAN: Free`, `ACCESS AVAILABLE NOW: Contributor`, `2 GB`, and an expiry, but no member activation/upgrade action. | Launch Access is an immediate temporary entitlement record, not an eligibility/offer lifecycle. | Build explicit eligible/offered/accepted/expired/revoked states and a member acceptance action with complete audit history. |
| LIVE-015 | S1 | C-004 | Founder Pricing displays Contributor `$1.99` founder / `$4.99` standard plus disabled tiers, with no `free during beta; $4.99/month later` disclosure. | Production pricing UI remains wired to founder/Stripe metadata instead of the approved beta-offer policy. | Hide disabled tiers, add the zero-charge beta offer, and show the future-price disclosure before acceptance. |
| LIVE-016 | S2 | A-010 | Reports Queue loads as an empty read-only list with no resolve, restrict, hold, or documented status workflow. | The current page only fetches report rows; moderation commands/state transitions are not implemented. | Implement audited report actions or explicitly label the page read-only until they exist. |
| LIVE-017 | S2 | A-002, A-012 | Feature Flags exposes only a free-text key and checkbox, with no listed flags/categories/effective states/group switches. | No canonical registry is supplied to the page, leaving administrators to guess internal keys. | Build the categorized registry-driven control surface described in `ADM-016`. |
| LIVE-018 | S1 | A-019 | At `390px`, an Administrator page is approximately `800px` wide, leaving core controls off-screen. | Admin layouts/forms retain desktop grid/min-width assumptions without a mobile action layout. | Add responsive single-column admin layouts, sticky visible actions, and per-tool narrow-viewport regression tests. |
| LIVE-019 | S3 | F-010 | A selected chat picture remains labeled `0%` until Send, even though the attachment then sends successfully. | The pre-send attachment component displays upload progress before an upload has begun, or does not update staged state. | Use a truthful staged/ready label before Send, then display real transfer progress only after upload starts. |
| LIVE-020 | S3 | F-006 | City typeahead returned usable Austin results, but the observed response took approximately `2.7s`. Org/AO typeahead also worked. | Large global-location search may lack a fast prefix index, debounce tuning, or geographically scoped result cache. | Instrument p50/p95 latency, optimize/index prefix search, and keep keyboard-accessible loading/empty states. |

## Additional Administrator Roles - Recommendation Only

Static inspection found only `MEMBER`, `ADMIN`, and `GOD`. `ADMIN` and `GOD` share broad access in most tools, while `GOD` has only a few exceptional global-tier operations. The following is a plan only; no role or permission changes are part of this QA pass.

| Recommended role | Intended permissions | Explicit exclusions / separation of duty |
|---|---|---|
| Owner / Super Admin | Role assignment, security recovery, production-secret rotation approval, destructive-operation approval, emergency feature control | Routine support/moderation should be delegated; no unilateral financial ledger editing |
| Account Support | Account lookup, identity/contact review, session reset, password-reset initiation, suspend/restore ordinary members | No top-role reset, permanent delete, tier pricing, billing secrets, ledger changes, or feature flags |
| Membership & Onboarding | Invite authority, bulk-invite operations, Contributor eligibility grant/revoke, beta-offer administration | No billing secrets, credit balances, moderation decisions, permanent deletion, or platform configuration |
| Trust & Safety | Reports, member/content restrictions, post/thread hold, moderation notes, evidence export | No account-password reset, billing, tier assignment, secrets, or platform operations |
| Communications Manager | Announcements, templates, scheduled member communications, delivery status | No account changes, bulk eligibility, moderation, billing, or system configuration |
| Finance & Billing | Read billing/ledger history, approved credits/refunds, plan-price status, payment-provider diagnostics | No content moderation, password reset, invite authority, role assignment, or direct plaintext-secret access |
| Platform Operator | Feature flags, scheduler/storage health, maintenance mode, diagnostics, deployment-safe operational controls | No message/content reading by default, account deletion, billing adjustments, password reset, or role assignment |
| Audit / Compliance (read-only) | Search/export audit records, protected-record verification, billing-ledger read, retention evidence | No mutation permissions of any kind |

Implementation sequence:

1. Define granular permission keys and an actor-above-target hierarchy; map legacy `GOD` to Owner and legacy `ADMIN` to a temporary compatibility bundle.
2. Add multi-role membership tables and immutable role-assignment history.
3. Centralize `requireAdminPermission`, target checks, step-up authentication, and typed/destructive confirmation.
4. Enforce permissions inside services and APIs before filtering navigation/actions from the same capability response.
5. Add an Owner-only role-management screen with self-lockout prevention and dual approval for the highest-risk changes.
6. Run the new controls in audit-only shadow mode, compare denials/allowances, then remove binary `isAdminRole` paths.
7. Require unit, API, and full browser matrices for every role/action/target combination before enabling the roles in production.

## Release Readiness Decision

**Final decision for this pass: Free, Contributor, and the current Administrator surface are not ready for external beta testers.** Authenticated production testing proved substantial working foundations, including onboarding/attestation/Terms, text and picture posting, gallery visibility, group creation/join/forum/photo/moderation, direct-message picture/reaction/reply/quote-reply, Writers Corner chapter publication, subscription notification, and truthful Free/Contributor storage displays.

Release remains blocked because:

1. Free has a reproducible gallery-to-avatar application crash, a public-versus-members Stream contract conflict, the wrong listing allowance, missing profile posts, forbidden Stream filters, and severe narrow-viewport overflow.
2. The requested admin-designated Contributor upgrade does not exist. Launch Access grants immediate temporary access with no member acceptance, no revoke/edit control, no free-beta disclosure, and inconsistent stored-tier/effective-tier behavior.
3. Contributor receives prohibited storefront/business creation controls, lacks its support entry, and remains horizontally unusable at a `390px` viewport.
4. Administrator pages expose disabled tiers and founder pricing, Feature Flags is not safely operable, Reports is read-only, narrow layouts overflow to approximately `800px`, and static review found unresolved S0 security/financial/destructive-data risks.

Recommended release gate order:

1. Repair and regression-test all S0 findings.
2. Repair `LIVE-001`, `LIVE-004`, `LIVE-005`, `LIVE-007`, `LIVE-011`, `LIVE-013`, `LIVE-014`, `LIVE-015`, and `LIVE-018` plus every other S1 item.
3. Re-run the same three-account production matrix at desktop and `390px`, in light and dark themes, including direct-route authorization tests.
4. Invite external beta testers only after no S0/S1 failures remain and every exposed control either completes successfully or is removed from sight.
