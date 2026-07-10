export const DEFAULT_FEED_PAGE_LIMIT = 20;
export const DEFAULT_FEED_COMMENT_PAGE_LIMIT = 30;
export const MAX_FEED_PAGE_LIMIT = 50;

export type FeedCursor = {
  createdAt: string;
  id: string;
};

export type FeedPageRequest = {
  cursor?: FeedCursor | null;
  limit?: number;
};

export type FeedPage<T> = {
  items: T[];
  nextCursor: FeedCursor | null;
  hasMore: boolean;
};

export type ParsedFeedCursor = {
  createdAt: Date;
  id: string;
};

export type ParsedFeedPageRequest = {
  cursor: ParsedFeedCursor | null;
  limit: number;
};

type FeedCursorRecord = {
  createdAt: Date;
  id: string;
};

export function parseFeedPageRequest(
  input: FeedPageRequest | undefined,
  defaultLimit = DEFAULT_FEED_PAGE_LIMIT
): ParsedFeedPageRequest {
  const requestedLimit = input?.limit;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit as number), 1), MAX_FEED_PAGE_LIMIT)
    : Math.min(Math.max(Math.trunc(defaultLimit), 1), MAX_FEED_PAGE_LIMIT);

  if (!input?.cursor) {
    return { cursor: null, limit };
  }

  const createdAt = new Date(input.cursor.createdAt);
  const id = input.cursor.id.trim();

  if (Number.isNaN(createdAt.getTime()) || !id) {
    throw new Error("Invalid feed cursor.");
  }

  return {
    cursor: { createdAt, id },
    limit
  };
}

export function feedDescendingCursorWhere(cursor: ParsedFeedCursor | null) {
  if (!cursor) return {};

  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      {
        createdAt: cursor.createdAt,
        id: { lt: cursor.id }
      }
    ]
  };
}

export function takeFeedPage<T extends FeedCursorRecord>(records: T[], limit: number): FeedPage<T> {
  const hasMore = records.length > limit;
  const items = hasMore ? records.slice(0, limit) : records;
  const lastItem = hasMore ? items.at(-1) : undefined;

  return {
    items,
    hasMore,
    nextCursor: lastItem
      ? {
          createdAt: lastItem.createdAt.toISOString(),
          id: lastItem.id
        }
      : null
  };
}
