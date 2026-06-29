# Facebook-to-Theta Desktop Feed Layout Study

Generated: 2026-06-26

Artifacts:
- facebook-grid-breakdown.png
- theta-current-grid-breakdown.png
- theta-proposed-feed-layout.png
- theta-before-after-comparison.png

## Facebook functional grid
- Fixed top command bar: about 68px high.
- Left navigation rail: about 430px wide at the provided 2048px screenshot width.
- Center feed card: about 816px wide; text does not stretch across the whole display.
- Right context rail: about 468px wide.
- Post card sequence: actor/source controls, dominant media, preview/body, social proof, actions.

## Why it works
- The user always knows where they are because navigation zones do not move.
- The feed is narrow enough to read but wide enough for image-heavy posts.
- Controls sit next to the object they affect.
- Side rails are useful but visually quieter than the feed.

## Theta-Space translation
- Keep the left member control panel and right ad stream.
- Add a top command bar for Home, People, Market, Search, and Comm.
- Use an 840-900px feed lane on large desktop, with media-first cards.
- Reserve safe space for utility controls so Report Issue never covers primary actions.
- Keep the dark/gold Theta-Space identity, avoiding a Facebook clone.


## Comm applet addition
- Messenger-style behavior should become a Theta-Space Comm dock, not a clone.
- The ad rail remains fixed at 360px and is never covered.
- When Comm opens, the feed shifts left and narrows to roughly 780-800px.
- The Comm list docks in the center-right gap at roughly 348px wide.
- Selecting a person changes the dock to a smaller active chat panel, bottom/right inside the content area, still left of the ad rail.
- Feed scrolling continues while the applet is open.


## Revised Comm slide rule
- Closed state: main stream remains centered.
- Click Comm: stream visually slides left.
- Open state: compact chat panel occupies the newly created lane between stream and ad stream.
- The chat panel is not locked over the page and does not cover the ad rail.
- Closing Comm returns the stream to center.
