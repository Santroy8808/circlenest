import { prisma } from "@/lib/db/prisma";
import type { FeedMode } from "@/lib/feed/modes";
import { FEED_MODES } from "@/lib/feed/modes";
import { FEED_FAST_WINDOW_DAYS, getInitialFeedData } from "@/lib/feed/queries";

export async function getStreamModeForUser(userId: string): Promise<FeedMode> {
  const pref = await prisma.userFeedPreference.findUnique({ where: { userId } });
  if (pref?.mode && FEED_MODES.includes(pref.mode as FeedMode)) return pref.mode as FeedMode;
  return "CHRONOLOGICAL";
}

export async function getStreamForUser(userId: string) {
  const mode = await getStreamModeForUser(userId);
  const { posts, hasOlderArchive } = await getInitialFeedData(userId, mode);
  return { mode, posts, hasOlderArchive, fastWindowDays: FEED_FAST_WINDOW_DAYS };
}
