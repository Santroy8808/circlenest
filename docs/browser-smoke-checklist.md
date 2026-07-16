# Theta-Space Browser Smoke Checklist

Generated: 2026-07-10T12:25:27.615Z

## Source

- Repo: `C:\Repos\Theta-Space-net\NewRepo`
- Commit: `75aa26b`
- Full commit: `75aa26b746197032d6708df806bba19c6fc5326f`
- Worktree: dirty when checklist was generated

## Purpose

Repeatable visual QC script for the NewRepo rebuild before any future production cutover.

This checklist does not replace lint, typecheck, build, or production smoke. It exists because the app is visual and workflow-heavy, so a green build alone is not enough.

## Browser Setup

- Desktop viewport: start around 1280x720 and also inspect a narrower laptop width.
- Mobile viewport: inspect phone-width navigation, uploads, gallery, mail, groups, and feedback.
- Use real clicks for navigation and route transitions.
- Do not use code inspection as a substitute for visual confirmation.
- Capture any server-side exception digest with the route and account used.

## Cross-Page UX Rules

- No page should open with a wall of forms.
- Navigation cards should be clickable as whole cards when they represent destinations.
- Forms should open as focused wizards, modals, drawers, or dedicated pages.
- Avoid boxes inside boxes unless the nesting communicates real structure.
- Dark theme borders, gold headings, and action button styles should remain consistent.
- Mobile must not clip fixed-position modals or block vertical scrolling.
- Ads must stay in reserved placements, never inside content detail cards.

## Auth - `/login`

Expected: Login form loads and accepts email or username.

Access: Public or guarded route.

- Confirm the form is visually centered, readable, and branded.
- Confirm email/username and password fields are obvious.
- Confirm invalid credentials show a clear inline error without crashing.

## Stream - `/home`

Expected: Authenticated user lands on the stream without server error.

Access: Authenticated smoke user required.

- Confirm the feed loads without a server-side exception.
- Confirm the Stream controls show only Latest and Friends. Latest is the member stream in reverse chronological order; Friends narrows it to posts shared with the viewer's friends.
- Confirm comments and replies stay in context after submission.

## Search - `/search`

Expected: Anonymous users redirect to login; authenticated users see privacy-aware search.

Access: Authenticated smoke user required.

- Confirm the page is guarded for anonymous users.
- Confirm authenticated search is one clear search surface, not competing forms.
- Confirm results are grouped by people, groups, Market, jobs, auditors, writing, and posts where allowed.

## Gallery - `/profile/gallery`

Expected: My Pics loads without second secure-area prompt.

Access: Authenticated smoke user required.

- Confirm My Pics is not behind the second secure-area wall.
- Confirm recent images appear immediately after upload without full page refresh.
- Confirm image view supports avatar/banner actions with clear success feedback.

## Groups - `/groups`

Expected: Group cards render and navigate into group profiles.

Access: Authenticated smoke user required.

- Confirm group cards show avatar, name, and tagline in a scrollable grid.
- Confirm clicking a joined group opens the group profile page.
- Confirm Create is a clear action card/button, not an always-open form.

## Mail - `/mail`

Expected: Mail client opens as mail-only, not chat.

Access: Authenticated smoke user required.

- Confirm the surface reads as mail only, not chat.
- Confirm contacts can be searched independently from friends.
- Confirm compose supports multiple internal recipients and clear send feedback.

## Market - `/market`

Expected: Square listing cards show title and price.

Access: Public or guarded route.

- Confirm listings are square thumbnail cards with title and price.
- Confirm Free users can browse without create-listing noise.
- Confirm listing details open outside ad placement surfaces.

## Jobs - `/jobs`

Expected: Job cards are clickable and show detail/contact pages.

Access: Authenticated smoke user required.

- Confirm all tiers can browse job listings.
- Confirm job cards open detail/contact pages.
- Confirm only Professional creation affordances are shown to eligible users.

## Support - `/feedback/new`

Expected: Feedback ticket form opens from anywhere.

Access: Public or guarded route.

- Confirm the issue report flow is reachable from the global Report issue button.
- Confirm context fields explain what will be captured.
- Confirm submit success produces a clear ticket reference.

## Admin - `/admin`

Expected: Protected admin wizard/card interface requires admin access.

Access: Authenticated smoke user required.

- Confirm non-admin users are blocked.
- Confirm admin sees cards of actions, not a wall of forms.
- Confirm clicking an action card starts a guided wizard with audit-aware copy.

## Finish Criteria

- Every route above has been checked on desktop.
- Gallery, mail, messages, groups, and feedback have also been checked on mobile width.
- Any server exception digest is logged as a feedback/support ticket or follow-up bug.
- If production cutover is being considered, regenerate release and cutover docs after fixes.
