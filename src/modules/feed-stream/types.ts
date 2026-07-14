import { FeedReactionType, FeedVisibility, MembershipTier } from "@prisma/client";
import { z } from "zod";

export const createFeedPostSchema = z.object({
  body: z.string().max(4000).default(""),
  visibility: z.nativeEnum(FeedVisibility).default(FeedVisibility.MEMBERS),
  mediaAssetId: z.string().optional().or(z.literal("")),
  targetProfileUserId: z.string().optional().or(z.literal(""))
}).refine((value) => value.body.trim().length > 0 || Boolean(value.mediaAssetId), {
  message: "Write something or attach a picture.",
  path: ["body"]
});

export const createFeedCommentSchema = z.object({
  postId: z.string().min(1),
  parentCommentId: z.string().optional().or(z.literal("")),
  body: z.string().max(2000).default(""),
  mediaAssetId: z.string().optional().or(z.literal(""))
}).refine((value) => value.body.trim().length > 0 || Boolean(value.mediaAssetId), {
  message: "Write a comment or attach a picture.",
  path: ["body"]
});

export const reactToFeedPostSchema = z.object({
  postId: z.string().min(1),
  type: z.nativeEnum(FeedReactionType)
});

export const reactToFeedCommentSchema = z.object({
  commentId: z.string().min(1),
  type: z.nativeEnum(FeedReactionType)
});

export type FeedMediaView = {
  id: string;
  publicUrl?: string | null;
  thumbnailUrl?: string | null;
  mimeType: string;
  originalName?: string | null;
};

export type FeedAuthorView = {
  id: string;
  username: string;
  displayName: string;
  tier: MembershipTier;
  avatarUrl?: string | null;
};

export type FeedReactionReactorsView = Partial<Record<FeedReactionType, FeedAuthorView[]>>;

export type FeedCommentView = {
  id: string;
  body: string;
  createdAt: string;
  author: FeedAuthorView;
  media?: FeedMediaView | null;
  reactions: Partial<Record<FeedReactionType, number>>;
  reactionReactors: FeedReactionReactorsView;
  replyCount: number;
  replies?: FeedCommentView[];
};

export type FeedPostView = {
  id: string;
  body: string;
  visibility: FeedVisibility;
  isAdminAnnouncement: boolean;
  pinnedUntil?: string | null;
  lastViewedAt?: string | null;
  streamCompressedAt?: string | null;
  streamArchivedAt?: string | null;
  streamDeletedAt?: string | null;
  adminHoldAt?: string | null;
  adminHoldReason?: string | null;
  adminHoldThread?: boolean;
  createdAt: string;
  media?: FeedMediaView | null;
  author: FeedAuthorView;
  reactions: Partial<Record<FeedReactionType, number>>;
  reactionReactors: FeedReactionReactorsView;
  comments: FeedCommentView[];
};
