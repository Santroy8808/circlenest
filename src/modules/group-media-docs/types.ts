import { GroupAssetKind } from "@prisma/client";
import { z } from "zod";

export const MAX_GROUP_STORAGE_BYTES = 40 * 1024 * 1024;
export const MAX_GROUP_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_GROUP_DOCUMENT_BYTES = 20 * 1024 * 1024;

const photoMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const documentMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain"
] as const;

export const groupAssetKindSchema = z.nativeEnum(GroupAssetKind);

const groupAssetUploadBaseSchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(3).max(160),
  sizeBytes: z.number().int().positive(),
  kind: groupAssetKindSchema,
  forumThreadId: z.string().trim().max(128).optional().or(z.literal("")),
  checksumSha256: z.string().trim().max(160).optional().nullable()
});

export const createGroupAssetUploadIntentSchema = groupAssetUploadBaseSchema
  .superRefine((value, context) => {
    if (value.kind === GroupAssetKind.PHOTO) {
      if (!photoMimeTypes.includes(value.mimeType as (typeof photoMimeTypes)[number])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Group photos must be JPG, PNG, GIF, or WEBP images.",
          path: ["mimeType"]
        });
      }
      if (value.sizeBytes > MAX_GROUP_PHOTO_BYTES) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Group photos can be up to 10MB each.",
          path: ["sizeBytes"]
        });
      }
    }

    if (value.kind === GroupAssetKind.DOCUMENT) {
      if (!documentMimeTypes.includes(value.mimeType as (typeof documentMimeTypes)[number])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Group documents must be PDF, Word, Excel, PowerPoint, or text files.",
          path: ["mimeType"]
        });
      }
      if (value.sizeBytes > MAX_GROUP_DOCUMENT_BYTES) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Group documents can be up to 20MB each.",
          path: ["sizeBytes"]
        });
      }
    }
  });

export const completeGroupAssetUploadSchema = groupAssetUploadBaseSchema
  .extend({
    intentId: z.string().trim().min(1).max(80),
    storageKey: z.string().trim().min(1).max(600),
    headline: z.string().max(120).optional().or(z.literal("")),
    description: z.string().max(1000).optional().or(z.literal(""))
  })
  .superRefine((value, context) => {
    const result = createGroupAssetUploadIntentSchema.safeParse(value);
    if (result.success) return;

    for (const issue of result.error.issues) {
      context.addIssue(issue);
    }
  });

export const createGroupAssetCommentSchema = z.object({
  body: z.string().min(1, "Write a comment.").max(1000)
});

export const updateGroupStorageLimitSchema = z.object({
  storageLimitBytes: z.number().int().min(0).max(10 * 1024 * 1024 * 1024)
});

export const purgeGroupStorageSchema = z.object({
  action: z.enum(["PURGE_OLD_IMAGES_TO_LIMIT", "PURGE_ALL_IMAGES", "DELETE_ALL_CONTENT"]),
  targetLimitBytes: z.number().int().min(0).optional(),
  password: z.string().optional().or(z.literal("")),
  confirmationText: z.string().optional().or(z.literal(""))
});

export type GroupAssetCommentView = {
  id: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
};

export type GroupAssetView = {
  id: string;
  kind: GroupAssetKind;
  headline?: string | null;
  description?: string | null;
  publicUrl: string | null;
  originalName: string | null;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
  uploader: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  comments: GroupAssetCommentView[];
  commentCount: number;
  viewerCanDelete: boolean;
};

export type GroupMediaPageView = {
  ok: true;
  group: {
    id: string;
    slug: string;
    name: string;
    storageLimitBytes: string;
  };
  assets: GroupAssetView[];
  storageUsedBytes: string;
  viewerCanUpload: boolean;
  viewerCanComment: boolean;
  viewerCanManageStorage: boolean;
};
