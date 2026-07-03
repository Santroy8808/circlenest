# Desktop Visual QA Backlog - 2026-07-02

Visual pass target: production `https://theta-space.net` with the Mike account.

Captured viewports:
- `1600x900`
- `1366x768`

Artifacts:
- Screenshots: `docs/visual-qa/2026-07-02/screenshots-prod/`
- Machine audit data: `docs/visual-qa/2026-07-02/visual-qa-results-prod.json`

Note: local `localhost:3100` was not used for the authenticated capture because the local dev database schema is behind the checked-in Prisma schema (`Profile.allowProfilePosts` missing), which blocks local login.

## Pages Captured

- Home: `screenshots-prod/desktop-1600x900/home.png`, `screenshots-prod/desktop-1366x768/home.png`
- Messages: `screenshots-prod/desktop-1600x900/messages.png`, `screenshots-prod/desktop-1366x768/messages.png`
- Mail: `screenshots-prod/desktop-1600x900/mail.png`, `screenshots-prod/desktop-1366x768/mail.png`
- Notifications: `screenshots-prod/desktop-1600x900/notifications.png`, `screenshots-prod/desktop-1366x768/notifications.png`
- Alerts: `screenshots-prod/desktop-1600x900/alerts.png`, `screenshots-prod/desktop-1366x768/alerts.png`
- People: `screenshots-prod/desktop-1600x900/people.png`, `screenshots-prod/desktop-1366x768/people.png`
- Friends: `screenshots-prod/desktop-1600x900/friends.png`, `screenshots-prod/desktop-1366x768/friends.png`
- Profile: `screenshots-prod/desktop-1600x900/profile-midearmon.png`, `screenshots-prod/desktop-1366x768/profile-midearmon.png`
- Gallery: `screenshots-prod/desktop-1600x900/profile-gallery.png`, `screenshots-prod/desktop-1366x768/profile-gallery.png`
- My Scientology: `screenshots-prod/desktop-1600x900/profile-scientology.png`, `screenshots-prod/desktop-1366x768/profile-scientology.png`
- Settings: `screenshots-prod/desktop-1600x900/settings.png`, `screenshots-prod/desktop-1366x768/settings.png`
- Profile Settings: `screenshots-prod/desktop-1600x900/settings-profile.png`, `screenshots-prod/desktop-1366x768/settings-profile.png`
- Resume Settings: `screenshots-prod/desktop-1600x900/settings-resume.png`, `screenshots-prod/desktop-1366x768/settings-resume.png`
- Market: `screenshots-prod/desktop-1600x900/market.png`, `screenshots-prod/desktop-1366x768/market.png`
- Jobs: `screenshots-prod/desktop-1600x900/jobs.png`, `screenshots-prod/desktop-1366x768/jobs.png`
- Groups: `screenshots-prod/desktop-1600x900/groups.png`, `screenshots-prod/desktop-1366x768/groups.png`
- Business Center: `screenshots-prod/desktop-1600x900/business-center.png`, `screenshots-prod/desktop-1366x768/business-center.png`
- Create Ad: `screenshots-prod/desktop-1600x900/business-create-ad.png`, `screenshots-prod/desktop-1366x768/business-create-ad.png`
- Campaigns: `screenshots-prod/desktop-1600x900/business-campaigns.png`, `screenshots-prod/desktop-1366x768/business-campaigns.png`
- Metrics: `screenshots-prod/desktop-1600x900/business-metrics.png`, `screenshots-prod/desktop-1366x768/business-metrics.png`
- Search: `screenshots-prod/desktop-1600x900/search.png`, `screenshots-prod/desktop-1366x768/search.png`
- Auditors: `screenshots-prod/desktop-1600x900/auditors.png`, `screenshots-prod/desktop-1366x768/auditors.png`
- Writers Corner: `screenshots-prod/desktop-1600x900/writers-corner.png`, `screenshots-prod/desktop-1366x768/writers-corner.png`

## Fix Backlog

### P0 - Business Center Is Still a Placeholder

Evidence:
- `screenshots-prod/desktop-1600x900/business-center.png`
- `screenshots-prod/desktop-1600x900/business-create-ad.png`
- `screenshots-prod/desktop-1600x900/business-campaigns.png`
- `screenshots-prod/desktop-1600x900/business-metrics.png`

Problem:
- Production shows "This feature is not yet available" for Business Center and its subpages.
- This may be a deployment issue, a tier gate issue, or the current account being blocked from a feature that should be visible.

Fix:
- Verify whether latest Business Center work deployed.
- Verify feature/tier gating for the account used in QA.
- If gated intentionally, the navigation should not send the user into a dead placeholder for core business workflows.

### P0 - Medium Desktop Width Breaks the Ad Stream Layout

Evidence:
- `screenshots-prod/desktop-1366x768/home.png`
- `screenshots-prod/desktop-1366x768/mail.png`
- `screenshots-prod/desktop-1366x768/notifications.png`

Problem:
- At `1366x768`, the right ad stream collapses below the main content instead of staying in a stable right column or intentionally converting into a clean responsive section.
- On Mail, the ad stream begins across the lower half of the viewport and visually cuts off the mail/contact area.
- The floating "Report issue" button overlaps ad content at this size.

Fix:
- Add a desktop layout breakpoint for narrow desktop widths.
- Either keep a smaller right rail or intentionally hide/move the ad stream below the full page content, not mid-viewport.
- Reserve safe space for "Report issue" so it never covers ad cards or form/send buttons.

### P1 - Ad Media Is Broken in the Ad Stream

Evidence:
- Broken image shown as `TESTING` on nearly every captured page, including `screenshots-prod/desktop-1600x900/home.png`, `people.png`, `messages.png`, and `market.png`.

Problem:
- One ad card renders as a broken image/alt text.
- This repeats across the site and damages perceived quality.

Fix:
- Validate ad media URL generation and Cloudflare/R2 access for ad thumbnails.
- Add a styled fallback state if an ad image fails.
- Consider hiding invalid-media ads from rotation until repaired.

### P1 - Gallery Search and Tag Controls Overlap/Crowd

Evidence:
- `screenshots-prod/desktop-1600x900/profile-gallery.png`
- `screenshots-prod/desktop-1366x768/profile-gallery.png`

Problem:
- Search fields and tag controls are packed into the same horizontal area.
- The Tags panel overlaps or crowds date fields; labels read as one continuous strip.
- `Selected` and `Visible` controls nearly touch.

Fix:
- Split Gallery tools into two clean rows or two equal panels: Search and Manage Tags.
- Give each row a stable grid, explicit gaps, and responsive wrapping.
- Keep primary actions on the right but prevent any input/button border from touching another.

### P1 - Messages Page Has Too Much Empty Space and Clipped Start-Chat Area

Evidence:
- `screenshots-prod/desktop-1600x900/messages.png`
- `screenshots-prod/desktop-1366x768/messages.png`

Problem:
- The empty "Select a chat" panel consumes a large central area.
- The left chat panel has the "Start a chat" section pushed to the bottom and partially cut off.
- Filter controls show two `All` buttons in different rows, which reads as duplicated or unclear.
- `Direct` and `Group` controls in the start-chat section are nearly touching.

Fix:
- Reduce empty-state panel weight and bring useful actions into view.
- Make the chat list/start-chat sidebar scroll internally without clipping.
- Clarify filter grouping: conversation type vs relationship filters.
- Add consistent spacing between Direct/Group and all filter pills.

### P1 - Mail Columns Are Too Narrow and Text Clips

Evidence:
- `screenshots-prod/desktop-1600x900/mail.png`
- `screenshots-prod/desktop-1366x768/mail.png`

Problem:
- Contact search placeholder clips.
- Mail thread titles and previews clip in the inbox column.
- At `1366x768`, the ad-stream collapse makes the mail client feel cut off.
- Empty message detail panel is visually heavy compared to useful content.

Fix:
- Rebalance Mail grid widths.
- Give Inbox enough width for thread title + sender preview.
- Truncate intentionally with ellipsis and tooltip, not hard clipping.
- Reuse the same narrow-desktop ad-stream fix from P0.

### P1 - People Cards Are Still Too Tall for Directory Browsing

Evidence:
- `screenshots-prod/desktop-1600x900/people.png`
- `screenshots-prod/desktop-1366x768/people.png`
- `screenshots-prod/desktop-1600x900/friends.png`

Problem:
- Browse People cards are large for directory scanning.
- Relationship actions stack vertically and consume too much height.
- Cards use substantial vertical space even when little data is present.

Fix:
- Make the default directory view denser.
- Use a two-row card/list pattern with avatar, name, handle, location, and compact action chips.
- Keep Square view available, but default to Rows or Compact when browsing lots of members.

### P2 - Top Navigation Uses Heavy Bitmap Icon Buttons

Evidence:
- All captured pages, especially `screenshots-prod/desktop-1600x900/home.png`.

Problem:
- The nav glyphs include visual button chrome inside another button area, creating a double-bordered/heavy look.
- The icons are consistent, but they visually compete with the page content.

Fix:
- Use transparent-background glyph assets or CSS-masked icons inside the existing nav button shell.
- Keep only one button border: the actual clickable control.

### P2 - Empty States Need Better Proportions

Evidence:
- `screenshots-prod/desktop-1600x900/notifications.png`
- `screenshots-prod/desktop-1600x900/alerts.png`
- `screenshots-prod/desktop-1600x900/business-center.png`

Problem:
- Empty-state cards are visually clean but overly broad relative to their content.
- Business Center placeholder looks especially oversized because it is the only content on the page.

Fix:
- Use smaller max-width empty-state cards or add useful secondary actions.
- For Notifications/Alerts, keep room for future controls: select all, hide selected, dismissed history.

### P2 - Report Issue Button Overlaps the Right Rail

Evidence:
- `screenshots-prod/desktop-1600x900/people.png`
- `screenshots-prod/desktop-1366x768/mail.png`
- `screenshots-prod/desktop-1366x768/home.png`

Problem:
- Floating "Report issue" sits on top of the ad stream cards, especially at lower desktop widths.

Fix:
- Anchor it outside content columns with a reserved safe area.
- On narrow desktop, move it to a bottom corner that does not cover controls or media.

## Pages That Look Mostly Stable

- Profile page structure is mostly coherent at `1600x900`; family cards are readable and profile stream starts naturally.
- Settings Profile cards are clean and balanced at `1600x900`.
- Market page is generally clean at `1600x900`; current issues are mostly global ad media/right-rail problems.

## Follow-Up Capture Needed

- Messages with an active chat selected.
- Messages search with live results populated.
- People Rows and Compact views.
- Profile family request dropdown/selection state.
- Stream thread detail page after clicking Comment/Reply.
- Business Center after confirming deployment/gating.
