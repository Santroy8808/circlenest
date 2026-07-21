import { FeedVisibility } from "@prisma/client";

/**
 * MEMBERS was the original name for a post visible on the main public Stream.
 * Keep both values readable during the expand/backfill/contract rollout.
 */
export const PUBLIC_STREAM_VISIBILITIES: FeedVisibility[] = [
  FeedVisibility.PUBLIC,
  FeedVisibility.MEMBERS
];

export function publicStreamVisibilityFilter(): { in: FeedVisibility[] } {
  return { in: [...PUBLIC_STREAM_VISIBILITIES] };
}

export function isPublicStreamVisibility(visibility: FeedVisibility): boolean {
  return PUBLIC_STREAM_VISIBILITIES.includes(visibility);
}
