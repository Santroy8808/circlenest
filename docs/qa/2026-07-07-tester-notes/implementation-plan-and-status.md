# Theta-Space Tester Feedback Implementation Plan

Source: `C:\Users\MikeDeArmon\Downloads\Theta Space Notes - 7_7_26.docx`

Scope: local development repo only. Do not push to GitHub or deploy to the new server until explicitly instructed.

## Product Rules

1. Keep the gold triangle as the standard default Like reaction. The tester suggestion to change it is rejected.
2. Notifications and alerts share the same surface UX, but remain separate product concepts:
   - Notifications: social/user activity such as friend, family, replies, mentions, and requests.
   - Alerts: system/platform/admin notices such as membership, storage, and operational notices.
3. Primary UX should be simple on first view. Detail and administrative power should be available after intentional navigation, not dumped into the first screen.

## Implementation Strategy

1. Simplify the desktop shell first.
   - Use flat, recognizable top-level navigation.
   - Move detailed choices into the destination pages.
   - Replace placeholder letter buttons with recognizable themed glyphs.

2. Make notifications and alerts one clear inbox.
   - One page: Notifications & Alerts.
   - Alerts get red treatment.
   - Notifications keep the gold/dark Theta-Space theme.
   - Add bulk selection, mark read, and hide/dismiss actions.
   - Friend/family approvals complete and disappear from the active list.

3. Make feed actions visually consistent.
   - Keep the gold triangle.
   - Normalize reaction/comment/share button sizing and spacing.
   - Use clearer tooltips and audience badge descriptions.
   - Remove staggered post alignment.

4. Improve the first-feed composer.
   - Use a compact `Communicate!` composer row.
   - Keep the primary action obvious without adding a heavy card.

5. Improve responsive desktop layout.
   - Keep the ad rail on the right for more desktop widths.
   - Prevent bottom ad placement from interfering with the feed on smaller desktop windows.
   - Make the ad create action text-based and explicit.

6. Add theme support.
   - Provide a command-bar light/dark toggle.
   - Store the preference locally for now.
   - A synced account-level preference can be added later if multi-device theme sync is desired.

## Implemented Locally

1. Flat side navigation in `src/components/platform/control-panel-nav.tsx`.
2. Live shell unread counts in `src/components/platform/app-shell.tsx`.
3. Bell notification glyph, red alert glyph, app-logo command mark, explicit `Create ad`, and light/dark toggle in `src/components/platform/desktop-command-bar.tsx`.
4. Shared Notifications & Alerts page in `src/app/notifications/page.tsx`.
5. `/alerts` redirects to `/notifications?view=alerts`.
6. New client-side notice center with filters, selection, hide selected, and mark-read controls in `src/components/notifications/notice-center-client.tsx`.
7. Friend/family request actions remove completed requests from the active notification list.
8. Feed cards are aligned, audience badges have explanatory titles, and action controls are normalized without changing the gold triangle.
9. `Communicate!` replaces the unclear top composer label.
10. CSS polish for simplified nav, notification/alert cards, command bar glyphs, gallery density, ad rail behavior, and light theme variables in `src/app/globals.css`.

## Follow-Up After Human Review

1. If users want light theme to follow them across devices, add a persisted `themePreference` user setting.
2. If the flattened side nav hides too many power-user shortcuts, add a compact shortcuts panel on each destination page instead of restoring nested side-nav menus.
3. Run the same visual QA pass against the deployed Windows Server version only after local human testing approves the UX direction.
