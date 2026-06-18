import { FeedReactionType, FeedVisibility } from "@prisma/client";
import { z } from "zod";

export const createFeedPostSchema = z.object({
  body: z.string().min(1, "Write something first.").max(4000),
  visibility: z.nativeEnum(FeedVisibility).default(FeedVisibility.MEMBERS),
  mediaAssetId: z.string().optional().or(z.literal(""))
});

export const createFeedCommentSchema = z.object({
  postId: z.string().min(1),
  parentCommentId: z.string().optional().or(z.literal("")),
  body: z.string().min(1, "Write a comment first.").max(2000),
  mediaAssetId: z.string().optional().or(z.literal(""))
});

export const reactToFeedPostSchema = z.object({
  postId: z.string().min(1),
  type: z.nativeEnum(FeedReactionType)
});

export const reactToFeedCommentSchema = z.object({
  commentId: z.string().min(1),
  type: z.nativeEnum(FeedReactionType)
});

export type FeedPostView = {
  id: string;
  body: string;
  visibility: FeedVisibility;
  createdAt: string;
  author: {
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  reactions: Partial<Record<FeedReactionType, number>>;
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: {
      username: string;
      displayName: string;
      avatarUrl?: string | null;
    };
    reactions: Partial<Record<FeedReactionType, number>>;
    replyCount: number;
  }>;
};
