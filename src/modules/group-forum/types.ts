import { GroupForumReactionType, GroupMemberRole } from "@prisma/client";
import { z } from "zod";

export const MAX_GROUP_FORUM_THREAD_TITLE_LENGTH = 140;
export const MAX_GROUP_FORUM_THREAD_BODY_LENGTH = 8000;
export const MAX_GROUP_FORUM_POST_BODY_LENGTH = 5000;
export const MAX_GROUP_FORUM_ENTITY_ID_LENGTH = 128;

export const createGroupForumThreadSchema = z.object({
  title: z.string().trim().min(2, "Add a thread title.").max(MAX_GROUP_FORUM_THREAD_TITLE_LENGTH),
  body: z.string().trim().min(1, "Write the opening post.").max(MAX_GROUP_FORUM_THREAD_BODY_LENGTH),
  allowPhotoReplies: z.boolean().default(false)
});

export const createGroupForumPostSchema = z.object({
  body: z.string().trim().max(MAX_GROUP_FORUM_POST_BODY_LENGTH).optional().or(z.literal("")),
  parentPostId: z.string().trim().max(MAX_GROUP_FORUM_ENTITY_ID_LENGTH).optional().or(z.literal("")),
  mediaAssetId: z.string().trim().max(MAX_GROUP_FORUM_ENTITY_ID_LENGTH).optional().or(z.literal(""))
}).superRefine((value, context) => {
  if (!value.body?.trim() && !value.mediaAssetId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Write a reply or attach a photo.",
      path: ["body"]
    });
  }
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
  nextCursor?: string | null;
};
