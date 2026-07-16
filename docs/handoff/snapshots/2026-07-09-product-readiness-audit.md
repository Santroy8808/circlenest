# Product Readiness And Staged Release Audit

Date: 2026-07-09

## Scope

- Live production review at `https://theta-space.net`.
- Public login, invite signup, password recovery, feedback, member home, People, profiles, and admin workflows.
- Desktop-width and mobile-width visual checks.
- Dark- and light-theme checks.
- Targeted code-to-UX, tier-policy, CSS, route, and readiness review.
- No GitHub push, production deploy, database seed, or server mutation.

One controlled social test was performed: the `admin` smoke account sent a friend request to the `jules` smoke account. The UI changed to `Friend pending` in about 410 ms. The request was not accepted during this session.

## Local Change

- `src/components/auth/login-form.tsx`: `Have an invite?` opens `/signup` in a new tab with `rel="noopener noreferrer"`.
- Full workspace verification, lint, type-check, and production build passed.

## Highest-Priority Release Blockers

1. Production password recovery is not complete. The request flow creates a token, but no reset email is sent; production also does not expose the dev token. A locked-out member therefore has no self-service recovery path.
2. Production smoke credentials still match hard-coded credentials stored in tracked seed/QA files. Rotate all affected accounts and remove credential literals before expanding access. Never run the seed script against production.
3. Paid tier policies are non-monotonic: paying can remove Free capabilities, and access evaluation can recommend `Upgrade to Free`. Specialized Auditor/Org roles should be additive rather than replacing the base plan.
4. Subscription switching can create a new Stripe subscription without canceling/updating the old one. Recurring monthly credit allocation, billing portal/cancel/downgrade flows, and several advertised entitlement enforcements are absent.
5. Light mode contains dark-only admin workflow cards, a dark fallback avatar, low-contrast gold/muted text, and inconsistent borders.
6. A live People card contained a broken profile image sourced from `/api/media/assets/...`.
7. The home page always renders an empty `home-front-strip` when no banner/system alert is available. Profile pages similarly reserve a large empty cover region.
8. Tablet CSS contains contradictory rules over the same `861-1180px` range; the later cascade forces a three-column layout that risks clipped content.

## Confirmed UX And Navigation Findings

- Public auth layouts are clean at 1280px and 390px with no horizontal border clipping.
- Public auth dark-mode contrast is strong, but production-facing copy still says `dev update page`, `Production email delivery comes later`, and `mostly for local/dev`.
- Signup has native required-field validation but little username/password guidance and incomplete autocomplete metadata.
- The member shell uses three independently scrolling columns while globally hiding scrollbars.
- Internal `Post ID`, `Ad ID`, paid-hold seconds, and credit-debug data are visible to ordinary members.
- The ad rail showed the same campaign twice at once.
- People search returned in about 589 ms, but the one-result copy said `1 people`.
- A different member's `/profile/[username]` route highlights Settings because `/profile` is nested under the Settings navigation section.
- `Dev Status` points to `/` although `/dev/status-page` exists.
- `/gethelp` exists but is absent from the shell and is blocked by the Auditor Seeker allowlist.
- `/alerts` still exists but navigation was consolidated into `/notifications?view=alerts`.
- Auditor Seeker accounts lose the normal member surface, which may conflict with the guaranteed Free core.
- No `page.tsx` route was deleted or renamed after 2026-07-02. The main recently hidden surfaces are direct Alerts navigation and the normal member navigation for Auditor Seeker accounts.

## Performance Samples

These were single-session observations, not a lab benchmark:

- Login: about 425 ms to DOM-ready.
- Signup: about 1.34 s.
- Password reset: about 433 ms.
- Admin portal: about 562 ms.
- Account-management workflow: about 724 ms.
- People: about 1.39 s.
- Member profile: about 1.68 s.
- People live search: about 589 ms.
- Friend request state change: about 410 ms.

Baseline response is acceptable. Add real-user monitoring before scaling and track p75 LCP, INP, route error rate, message latency, and failed media loads.

## Free Launch Core

Free must retain:

- Invite registration, login, real password recovery, profile, privacy, blocking/reporting, and notifications.
- People discovery and friend/family/acquaintance relationships.
- Stream posts, comments/replies, reactions, and sharing.
- Direct messages, group communication, and internal mail.
- Groups: create/join/post with basic owner moderation.
- Gallery upload, organization, comments, and deletion.
- Basic Market and job listings.
- Basic business profile/storefront and acting as an owned business identity.
- Search, feedback, and safety/reporting flows.

## Paid Release Boundary

Communication itself must not be paywalled. Paid value should be scale, reach, storage, analytics, and administrative efficiency:

- Higher storage and upload/listing limits.
- Professional storefront, job, and business tools.
- Advertising, targeting, campaign analytics, and credits.
- Events, fundraising, Writers Corner, and expanded publishing.
- Mass communication and advanced group moderation.
- Organization/Auditor role add-ons and professional profile tools.
- Advanced analytics and automation.

## Recommended Staging

1. Hardening release: fix account recovery, credential exposure, broken media, tier inheritance, light mode, and release-gate failures.
2. Small invite-only cohort: complete first-session activation and core communication loops; measure signup-to-first-connection/message/post.
3. Expanded invite-only beta: enable a clearly labeled Founding Pro Preview through temporary grants, while Free remains permanent.
4. Month 3-4 paid launch: enable only after subscription replacement/cancel/downgrade, recurring credits, entitlement enforcement, feature comparison, and billing support are complete.

## Standing Product Rule

Theta-Space is intentionally invite-only. Judge acquisition on whether an invited person can register and become active quickly, not on whether strangers can self-register.
