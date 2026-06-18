import { GroupForumReactionType, GroupMemberRole } from "@prisma/client";
import { z } from "zod";

export const createGroupForumThreadSchema = z.object({
  title: z.string().min(2, "Add a thread title.").max(140),
  body: z.string().min(1, "Write the opening post.").max(8000),
  allowPhotoReplies: z.boolean().default(false)
});

export const createGroupForumPostSchema = z.object({
  body: z.string().min(1, "Write a reply.").max(5000),
  parentPostId: z.string().optional().or(z.literal("")),
  mediaAssetId: z.string().optional().or(z.literal(""))
});

export const reactToGroupForumThreadSchema = z.object({
  type: z.nativeEnum(GroupForumReactionType)
});

export const reactToGroupForumPostSchema = z.object({
  type: z.nativeEnum(GroupForumReactionType)
});

export type GroupForumAuthorView = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type GroupForumReactionSummary = Partial<Record<GroupForumReactionType, number>>;

export type GroupForumPostView = {
  id: string;
  body: string;
  mediaUrl?: string | null;
  parentPostId?: string | null;
  createdAt: string;
  author: GroupForumAuthorView;
  reactions: GroupForumReactionSummary;
  replyCount: number;
};

export type GroupForumThreadCardView = {
  id: string;
  title: string;
  body: string;
  allowPhotoReplies: boolean;
  createdAt: string;
  updatedAt: string;
  endedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  author: GroupForumAuthorView;
  reactions: GroupForumReactionSummary;
  replyCount: number;
  viewerCanEnd: boolean;
  viewerCanDelete: boolean;
};

export type GroupForumThreadDetailView = GroupForumThreadCardView & {
  posts: GroupForumPostView[];
  viewerRole?: GroupMemberRole | null;
};
