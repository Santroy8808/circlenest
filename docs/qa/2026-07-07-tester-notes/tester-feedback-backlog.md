# Theta-Space Tester Feedback Backlog - 2026-07-07

Source document: `C:\Users\MikeDeArmon\Downloads\Theta Space Notes - 7_7_26.docx`

Extracted screenshots are in `docs/qa/2026-07-07-tester-notes/media/`.

## Immediate Fixes Applied

1. Logout confirmation
   - Evidence: tester note says logout should confirm instead of immediately signing out.
   - Fix: `ControlPanelNav` and reusable `LogoutButton` now ask `Log out of Theta-Space?`.
   - Files: `src/components/platform/control-panel-nav.tsx`, `src/components/auth/logout-button.tsx`

2. Aligned stream cards
   - Evidence: screenshot `image8.png` and note that posts should not be staggered.
   - Fix: removed desktop alternating left/right margins on feed posts.
   - File: `src/app/globals.css`

3. Clearer ad creation entry
   - Evidence: screenshots `image14.png`, `image16.png`, `image17.png`; plus icon does not communicate ad creation.
   - Fix: command bar action now says `Create ad`; ad rail header also has a `Create ad` link.
   - Files: `src/components/platform/desktop-command-bar.tsx`, `src/components/platform/app-shell.tsx`, `src/app/globals.css`

## High Priority Follow-Up

1. Simplify desktop side navigation
   - Evidence: overall note, screenshots `image12.png`, `image13.png`.
   - Problem: left side navigation has too many expandable groups and repeated options.
   - Proposed direction: convert side nav into a flatter Facebook-inspired main menu: profile, stream/home, people, comm, market, settings. Deeper items should live on their destination pages rather than as nested side-nav rows.
   - Risk: this changes navigation behavior broadly and should be done as a focused UX pass.

2. Replace letter-based notification/alert icons
   - Evidence: screenshots `image14.png`, `image15.png`.
   - Problem: `N` and `!` are not standard enough.
   - Proposed direction: use a bell glyph for notifications and a system notice glyph for alerts. Preserve the product rule that friend/family requests are notifications, while alerts remain system/platform notices.
   - Note: tester suggested combining alerts and notifications, but current platform semantics intentionally separate them.

3. Make the top communicate entry feel native
   - Evidence: screenshot `image1.png`, Facebook comparison `image2.png`, `image3.png`.
   - Problem: the current communicate card/button feels like an extra control instead of a ready composer.
   - Proposed direction: keep a compact always-visible composer row on the stream, similar to a social feed status box, with avatar + placeholder + media action.

4. Gallery visual cleanup
   - Evidence: screenshot `image10.png`, note says `My Pics` is messed up.
   - Problem: gallery controls still feel dense and control groups visually compete.
   - Proposed direction: split gallery into a compact toolbar row, one search/date row, one tag-management drawer or modal, and a larger 3-column thumbnail grid.

5. Ad rail responsive behavior
   - Evidence: screenshot `image4.png` and tester note that ads at the bottom interfere with the feed.
   - Problem: on narrower desktop windows, the ad stream can feel too dominant or displaced.
   - Proposed direction: keep ad rail right-side until a clear breakpoint; below that, collapse to a compact sponsored rail or hide behind an `Ads` tab. Do not show large bottom ads over primary feed content.

## Medium Priority Follow-Up

1. Reaction icon clarity and size consistency
   - Evidence: screenshots `image5.png`, `image7.png`, `image9.png`.
   - Problem: reaction/comment/share controls vary visually; comment icon can look squashed.
   - Proposed direction: normalize glyph bounding boxes and button sizing. Keep the gold triangle as the default like per product rule. Tester suggested adding a thumb inside the triangle, but that conflicts with the existing standing standard and needs owner approval before changing.

2. Explain or redesign the `Members` badge
   - Evidence: screenshot `image9.png`, note asks what `Members` means.
   - Problem: audience badge is not self-explanatory.
   - Proposed direction: add tooltip text such as `Visible to members` and consider using an audience/privacy icon plus text.

3. Replace `TS` placeholder brand mark with final app logo
   - Evidence: screenshot `image11.png`, note says change this to the app logo.
   - Proposed direction: use the gold Theta-Space icon asset in the command bar and side panel, not a text placeholder.

4. Offer light mode
   - Evidence: tester note requests light mode.
   - Proposed direction: add a theme setting with `dark`, `light`, and `system`, defaulting to dark. This is a global design task, not a one-page CSS tweak.

## Explicit Product Decisions Needed

1. Alerts and notifications
   - Tester suggests combining them.
   - Existing product rule separates notifications from alerts: requests and social events are notifications; alerts are system/admin/storage/membership notices.
   - Recommendation: keep separate data types, but make the UI simpler by using standard icons and summaries.

2. Triangle like reaction
   - Tester suggests combining thumbs-up with triangle.
   - Existing product rule says the gold triangle is the default Like replacement.
   - Recommendation: keep the triangle for now and improve size, contrast, and tooltip clarity.

3. Side-nav flattening
   - Tester recommends no drop-down sections.
   - Recommendation: schedule as a single desktop shell UX pass because it affects every page.

