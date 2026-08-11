# Theta-Space Dashboard, Marketplace, Jobs, And Business Profile Restructure

## Planning status

This document is the implementation contract for the requested restructure. It is based on the live repository as of 2026-08-11. The work extends existing modules and does not introduce a second Market, Jobs, authentication, or business-profile system.

## Existing architecture findings

Theta-Space is a Next.js App Router application backed by Prisma. Authenticated application pages render inside `AppShell`, which already provides the control panel, main content lane, optional right ad rail, activity tracking, navigation counts, and responsive behavior.

The current post-login landing page is `/home`, rendered by `HomeStreamWorkspace`. `/` redirects authenticated users to `getDefaultHomeHref`, which currently persists a selected default destination in `Profile.theme.defaultHomePage`. The existing default-home mechanism is therefore the correct persistence location and extension point.

Jobs already has a complete authenticated listing model and lifecycle. `JobListing` stores the title, company, summary, description, needs, wants, category, employment type, location, remote state, compensation, contact details, image, overlay text, status, and dates. `jobs.service.ts` owns listing/search/create/update behavior; `/jobs` and `/jobs/[listingId]` currently require authentication.

Market already has its own listing module, cards, detail views, image handling, listing preferences, create flow, and a public business-storefront integration. It must remain a member-only marketplace.

Business Profiles are one-per-owner-user and already have public storefronts at `/storefront/[slug]` when `publicStorefrontEnabled` is true. The storefront service already derives active Market listings from `BusinessProfile.ownerUserId`; jobs can use the same owner relationship without a new ownership table.

Free and Contributor policies already allow both `jobs.browse` and `jobs.createListing`. Existing system constraints must remain in force for all authenticated job creation and editing.

## Relevant routes, components, and models

| Area | Existing reuse point | Planned change |
| --- | --- | --- |
| Login redirect | `/`, `/home/default`, `default-home-preferences.service.ts` | Add Dashboard as the fallback default and selectable default-home option. |
| Logged-in shell | `components/platform/app-shell.tsx` | Reuse unchanged for `/dashboard` and signed-in Jobs pages. |
| Stream | `/home`, `HomeStreamWorkspace`, `feed-stream.service.ts` | Retain as the complete Stream page; expose a concise dashboard widget. |
| Messages | `/messages`, `MessagesClient`, `chat-messages.service.ts` | Expose recent/unread conversations widget. |
| Groups | `/groups`, `GroupsDirectoryClient`, `groups.service.ts` | Expose joined-group activity widget. |
| Gallery | `/profile/gallery`, gallery media service | Expose a personal-media widget only where enabled. |
| Market | `/market`, `MarketDirectoryClient`, `market.service.ts` | Expose active listings and quick actions in a widget; preserve member-only Market. |
| Jobs | `/jobs`, `JobsBoardClient`, `jobs.service.ts` | Add public read-only rendering and job-to-business linkage. |
| Business | `/business-center`, `/storefront/[slug]`, `business-storefront.service.ts` | Add job content to public/profile views, using existing ownership. |
| Persistence | `Profile.theme` JSON | Store a validated dashboard configuration under a dedicated key. |

## Required dashboard architecture

### Route and post-login behavior

Add protected `/dashboard` as the Dashboard surface. `getDefaultHomeHref` will return `/dashboard` when no valid preference exists. Existing explicit choices such as Stream, Market, or Jobs stay intact so previously selected user preferences are not silently overwritten. Dashboard is added to the Default Home settings options and becomes the normal initial selection for new accounts.

The Home control-panel section will point to the selected default as it does today; its `My Stream` menu item remains `/home`.

### Layout model

Use CSS Grid with no new drag-and-drop dependency. Persist this typed configuration in `Profile.theme.dashboard`:

```ts
{
  version: 1,
  layout: "quad" | "stacked" | "split" | "single",
  slots: [
    { id: "a", widget: "market" },
    { id: "b", widget: "jobs" },
    { id: "c", widget: "messages" },
    { id: "d", widget: "stream" }
  ],
  primarySlot: "a" | "b" | "c" | "d"
}
```

`quad` shows four equal regions in a two-by-two grid. `stacked` shows the first two chosen regions vertically. `split` shows the first two regions side-by-side. `single` renders `primarySlot` full width. Hidden slots remain in configuration so returning to four cards restores the user’s prior setup.

Do not allow duplicate widgets in visible slots. An unavailable feature cannot be selected; an already-saved unavailable widget is normalized to the first permitted unused widget. This provides a useful broad overview and protects permissions without data loss.

### Dashboard controls

Keep controls compact in a Dashboard header:

- Layout button/menu: Four cards, Two stacked, Two side-by-side, One card.
- Restore default button: restores four cards in the initial order.
- Per-card options menu: Replace widget, Expand, Open full page.

Replacing a card opens a small inline/menu chooser of available widgets rather than a settings screen. Expanding switches to `single` with that card selected; restoring a layout is a single operation. Each widget has an obvious full-page link.

### Initial widget list

Default cards are Market, Jobs, Messages, and Stream. Groups and Gallery are selectable when enabled. A Business widget is selectable only for accounts that can manage or own a business profile; it is not an analytics widget.

| Widget | Information | Direct interaction | Full page |
| --- | --- | --- | --- |
| Market | Newest active listings: thumbnail, title, price, city, seller/business name | Open a listing; create a listing when allowed | `/market` |
| Jobs | Newest active listings: role, employer, location/remote, type, compensation | Open a job; create a job when allowed | `/jobs` |
| Messages | Recent conversations, unread count, most recent message preview | Open selected conversation | `/messages` |
| Stream | Recent public/member-visible posts with author and short content preview | Open post/profile; create opens Stream composer | `/home` |
| Groups | Joined groups, member/activity information, empty-state link to browse | Open group | `/groups` |
| Gallery | Recent own media thumbnails and upload entry point | Open media/upload | `/profile/gallery` |
| Business | Business name, current storefront status, latest owned listings/jobs | Open Business Center/storefront | `/business-center` |

All widgets must have loading, no-data, and recoverable error states. Widget queries are server-side in the dashboard page so the first dashboard render does not depend on a client-side waterfall.

## Required Jobs changes

### Public Jobs

`/jobs` remains the canonical public list URL. When the visitor is logged out, render a dedicated public board without `AppShell`, control panel, member actions, contacts, or private data. When signed in, retain the existing full Jobs board inside `AppShell`.

`/jobs/[listingId]` follows the same rule: a logged-out visitor receives a dedicated public job detail while a signed-in user receives the existing member detail. Both use the same `JobListing` row and the same active-status query; no records are copied.

Public cards and details expose only:

- title, company/employer display name, category, employment type, city/remote status, summary, posted date, compensation, published image/overlay text;
- public Business Profile name, location, logo, and storefront link only when the associated profile has `publicStorefrontEnabled`;
- job description, needs, wants, and intentionally public contact details.

They never expose a member username, internal contact route, private profile data, inactive/draft/expired listings, management actions, or any authenticated shell data.

### Create Job authentication flow

The public `Create a Job` action links to `/login?callbackUrl=/jobs/create`. The existing login callback handling returns a valid member to `/jobs/create`. Logged-out visitors receive no registration path, preserving invitation-only access. `/jobs/create` and all mutation routes remain protected by the current policy checks.

### Business relationship

Jobs retain `employerUserId` as the only ownership source of truth. The jobs query will include the employer’s `BusinessProfile`. When it is public, the job displays a Business Profile link and public logo/name. A public storefront will gain an Active Jobs section derived by `ownerUserId`, alongside its current Market listings. No schema migration is necessary for this relationship.

## Required Marketplace changes

Market remains protected. Add a dashboard query/view that reuses `safeListMarketListings` (or a small bounded service query) and existing card view types. The widget shows genuinely useful listing data and directs members to detail pages or permitted listing creation. No Market permissions change, no duplicate endpoint is introduced, and no public Market route is created.

## Required Business Profile changes

Business center remains the management area. Extend the public Business Profile view type/service to include active jobs owned by that business identity. Render these in the public storefront only for profiles that are already public. Link member-visible job detail pages to the business profile where the current account may see it; public Jobs only link when the storefront is public.

The Business widget will surface storefront status plus recent owned Market and Job content for the active business owner. It will not introduce advertising metrics or business analytics.

## Persistence, APIs, and schema

### Database/schema

No Prisma migration is required for the first implementation. Dashboard configuration is versioned JSON in `Profile.theme`, matching the existing default-home preference pattern. Jobs/business linkage is derived through `JobListing.employerUserId -> User.businessProfile`.

### APIs/server changes

- Add an authenticated dashboard-preferences route for read/update/reset of the validated layout configuration.
- Add small dashboard data service functions; do not expose a generic unguarded dashboard API.
- Extend jobs service with public-safe list/detail functions that apply `ACTIVE` status and map only approved fields.
- Keep existing authenticated `/api/jobs` read/write routes protected. Add a dedicated read-only `/api/public/jobs` route only if client-side filtering/pagination is needed; server rendering is preferred for the first version.
- Extend business storefront service/view contracts with active-job data.

## Responsive approach

Use the existing AppShell content lane and CSS custom-property spacing. Desktop renders the selected grid. Laptop can reduce widget internals without collapsing the shell. Tablet and mobile use one column, preserving widget order and full-page links. Layout configuration is retained even when the rendered layout collapses for a narrow viewport. Card controls remain keyboard reachable and do not require hover.

The public Jobs pages use a separate responsive public shell appropriate for unauthenticated visitors, not the authenticated application layout with controls hidden.

## Implementation sequence and QA ledger plan

1. **Dashboard contracts and preferences**: dashboard types, parser/normalizer, `Profile.theme` persistence, dashboard default-home option, preference API, unit tests.
   - QA: invalid persisted JSON, unavailable widget normalization, duplicate prevention, reset/default behavior, reload persistence.
2. **Dashboard shell and layout**: `/dashboard`, AppShell integration, CSS Grid modes, controls, responsive skeleton/loading/empty states.
   - QA: quad/stacked/split/single at desktop and mobile dimensions; focus and keyboard behavior.
3. **Dashboard widgets**: Market, Jobs, Messages, Stream, then permitted Groups/Gallery/Business widgets.
   - QA: correct permissions, empty states, links, errors, no client fetch waterfall.
4. **Market dashboard integration**: bounded latest-listings query and market widget interactions.
   - QA: active-only results, seller/business presentation, Free/Contributor creation visibility.
5. **Jobs public projection and member behavior**: public board/detail components, authenticated route branching, Create Job login return flow.
   - QA: logged-out browse/detail, logged-out create redirect, no public registration, active-only output, signed-in view unchanged.
6. **Business integration**: derive owned jobs, add public storefront and job links, Business dashboard widget.
   - QA: public storefront toggle boundary, absent business profile, business actor accounts, market/job links.
7. **Responsive and final integration**: inspect desktop, laptop, tablet, mobile; run type, lint, build; reconcile all QA findings in the ledger.

QA issues will be recorded in `plans/theta-dashboard-marketplace-jobs-qa-ledger.md` with the requested ID, module, severity, route/component, reproduction, expected/actual results, data impact, suspected source, dependency, recommendation, and blocking status. Minor findings remain in the ledger until final remediation; blocking security, data, or auth failures are corrected immediately.

## Expected files

Required changes are expected in these areas:

- `src/modules/home-preferences/default-home-preferences.service.ts`
- `src/modules/dashboard/*` (new dashboard contracts, data service, and tests)
- `src/app/api/preferences/dashboard/route.ts` (new)
- `src/app/dashboard/page.tsx` (new)
- `src/components/dashboard/*` (new)
- `src/components/platform/app-shell.tsx` only if navigation/default destination wiring needs adjustment
- `src/modules/navigation/member-navigation.ts` and tests
- `src/app/jobs/page.tsx`, `src/app/jobs/[listingId]/page.tsx`
- `src/components/jobs/*` and `src/modules/jobs/jobs.service.ts`, `types.ts`, tests
- `src/components/public-jobs/*` (new)
- `src/modules/business-storefront/business-storefront.service.ts`, `types.ts`, and storefront components
- `src/app/globals.css`

## Scope classification

### Required for this project

- Customizable Dashboard with the four requested layout modes and persisted configuration.
- Initial useful widgets for Market, Jobs, Messages, Stream, Groups, Gallery, and eligible Business accounts.
- Dashboard as the new default for users without an explicit older default-home choice.
- Public browse/detail pages for active jobs and protected Create Job return flow.
- Market/Jobs/Business profile integration using existing data ownership.
- Responsive behavior, tests, per-segment QA ledger, and final remediation.

### Recommended but optional

- A public jobs API with pagination only if public board client filtering or pagination becomes necessary after server-rendered implementation.
- A small public SEO metadata helper for public Job detail pages.

### Future enhancements, excluded from this implementation

- Drag-and-drop dashboard rearrangement.
- Deep analytics/advertising widgets, marketplace analytics, business reporting, or specialized group metrics.
- Public registration, public Market browsing, applications workflow, saved-job alerts, job payments, and job sponsorship billing.
- Historical dashboard widget snapshots or cross-device widget session state beyond the persisted configuration.
