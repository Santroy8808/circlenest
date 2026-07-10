import { z } from "zod";

export const MAX_STOREFRONT_FORUM_TITLE_LENGTH = 140;
export const MAX_STOREFRONT_FORUM_BODY_LENGTH = 8000;
export const MAX_STOREFRONT_FORUM_POST_BODY_LENGTH = 5000;
export const MAX_STOREFRONT_FORUM_NAME_LENGTH = 80;
export const MAX_STOREFRONT_FORUM_IMAGE_URL_LENGTH = 500;
export const MAX_STOREFRONT_FORUM_SEARCH_LENGTH = 80;

const optionalImageUrlSchema = z.string().trim().url().max(MAX_STOREFRONT_FORUM_IMAGE_URL_LENGTH).optional().or(z.literal(""));

export const createStorefrontForumTopicSchema = z.object({
  title: z.string().trim().min(2, "Add a topic title.").max(MAX_STOREFRONT_FORUM_TITLE_LENGTH),
  body: z.string().trim().min(1, "Write the opening post.").max(MAX_STOREFRONT_FORUM_BODY_LENGTH),
  guestName: z.string().trim().max(MAX_STOREFRONT_FORUM_NAME_LENGTH).optional().or(z.literal("")),
  imageUrl: optionalImageUrlSchema
});

export const createStorefrontForumPostSchema = z
  .object({
    body: z.string().trim().max(MAX_STOREFRONT_FORUM_POST_BODY_LENGTH).optional().or(z.literal("")),
    parentPostId: z.string().trim().max(128).optional().or(z.literal("")),
    guestName: z.string().trim().max(MAX_STOREFRONT_FORUM_NAME_LENGTH).optional().or(z.literal("")),
    imageUrl: optionalImageUrlSchema
  })
  .superRefine((value, context) => {
    if (!value.body?.trim() && !value.imageUrl?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Write a reply or attach an image.",
        path: ["body"]
      });
    }
  });

export const listStorefrontForumTopicsSchema = z.object({
  query: z.string().trim().max(MAX_STOREFRONT_FORUM_SEARCH_LENGTH).optional().or(z.literal(""))
});

export type StorefrontForumAuthorView = {
  id: string | null;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  isGuest: boolean;
};

export type StorefrontForumPostView = {
  id: string;
  body: string;
  imageUrl: string | null;
  parentPostId: string | null;
  createdAt: string;
  author: StorefrontForumAuthorView;
  replyCount: number;
  replies?: StorefrontForumPostView[];
  viewerCanDelete: boolean;
};

export type StorefrontForumTopicListItemView = {
  id: string;
  title: string;
  bodyPreview: string;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastPostAt: string;
  author: StorefrontForumAuthorView;
  replyCount: number;
  viewerCanDelete: boolean;
  publicUrl: string;
};

export type StorefrontForumTopicDetailView = StorefrontForumTopicListItemView & {
  body: string;
  posts: StorefrontForumPostView[];
  forumAllowPictureUploads: boolean;
};

export type StorefrontForumView = {
  profile: {
    id: string;
    slug: string;
    businessName: string;
    bannerUrl: string | null;
    forumEnabled: boolean;
    forumAllowPictureUploads: boolean;
  };
  topics: StorefrontForumTopicListItemView[];
  viewerCanManage: boolean;
};
