# Theta-Space Dashboard, Marketplace, Jobs, and Business Profile QA Ledger

## QA-001: Authenticated Dashboard and Jobs visual validation blocked locally

| Field | Detail |
| --- | --- |
| Status | Open - environment blocker |
| Severity | Blocker for local authenticated visual QA only |
| Module | Dashboard and signed-in Jobs |
| Routes | `/dashboard`, `/jobs` |
| Reproduction | Sign in against the local development database and load either route. |
| Expected | The authenticated workspace renders with dashboard widgets and the existing Jobs board. |
| Actual | Prisma reports missing schema objects, including `User.isBetaTester` and `MembershipUpgradeOffer`. `prisma migrate status` reports 56 unapplied migrations. |
| Data impact | None observed. No migration or data mutation was attempted. |
| Suspected source | The local `theta_space` development database is behind the checked-out application schema. |
| Dependency | An intentionally selected development/test database with the pending migrations applied. |
| Recommendation | Apply migrations only to the intended non-production development/test database, then rerun signed-in visual QA for Dashboard and Jobs. |

## QA-002: Local preview assets briefly unavailable after production build

| Field | Detail |
| --- | --- |
| Status | Resolved |
| Severity | Medium |
| Module | Local Next.js preview |
| Route/component | Local development server assets |
| Reproduction | Run a production build while the local development server is using the same `.next` directory. |
| Expected | The local preview remains able to load its compiled chunks. |
| Actual | The preview requested a missing generated chunk after the build replaced artifacts. |
| Resolution | Restarted the known local Theta-Space development server. Public route QA completed normally afterward. |
| Recommendation | Stop the development server before running a production build, or use separate build output directories. |

## Validation Summary

| Area | Result |
| --- | --- |
| Public Jobs desktop layout | Passed |
| Public Jobs mobile layout at 390 x 844 | Passed |
| Public Create Job login callback | Passed: `/login?callbackUrl=/jobs/create` |
| Unauthenticated Dashboard redirect | Passed: `/login?callbackUrl=/dashboard` |
| Dashboard preference unit tests | Passed |
| Jobs and business profile service tests | Passed |
| Type checking | Passed |
| Linting | Passed |
| Production Next build | Passed using `npx next build` |
