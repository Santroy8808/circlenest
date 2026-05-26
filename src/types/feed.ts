import type { FeedMode } from "@/lib/feed/modes";

export type FeedPost = {
  id: string;
  content: string;
  authorUsername: string;
  createdAt: Date;
  explanation: string;
};

export type FeedContext = {
  userId: string;
  mode: FeedMode;
};
