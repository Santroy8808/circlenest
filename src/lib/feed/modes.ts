export const FEED_MODES = [
  "CHRONOLOGICAL",
  "FRIENDS_FIRST",
  "INTEREST_BASED",
  "QUIET",
  "DISCOVERY",
] as const;

export type FeedMode = (typeof FEED_MODES)[number];
