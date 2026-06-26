import { MediaVisibility } from "@prisma/client";
import { z } from "zod";

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const DEFAULT_GALLERY_TAGS = ["Family", "Friends", "Events"] as const;

export const uploadSourceSchema = z.enum(["GALLERY", "STREAM_POST", "STREAM_REPLY", "AD_CREATIVE"]).default("GALLERY");

export const createUploadIntentSchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string().regex(/^image\/(jpeg|png|gif|webp)$/),
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_UPLOAD_BYTES),
  visibility: z.nativeEnum(MediaVisibility).default(MediaVisibility.PRIVATE),
  source: uploadSourceSchema
});

export const completeUploadSchema = createUploadIntentSchema.extend({
  storageKey: z.string().min(1).max(600),
  caption: z.string().max(500).optional().or(z.literal("")),
  commentsEnabled: z.boolean().default(false),
  tags: z.array(z.string().min(1).max(40)).max(20).default([])
});

export const updateGalleryAssetSettingsSchema = z.object({
  mediaAssetId: z.string().min(1),
  visibility: z.nativeEnum(MediaVisibility),
  commentsEnabled: z.boolean().default(false)
});

export const createGalleryAssetCommentSchema = z.object({
  mediaAssetId: z.string().min(1),
  body: z.string().trim().min(1, "Write a comment first.").max(1000, "Comment is too long.")
});

export const updateGalleryAssetTagsSchema = z.object({
  mediaAssetIds: z.array(z.string().min(1)).min(1).max(100),
  tags: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  mode: z.enum(["add", "replace"]).default("add")
});

export const deleteGalleryAssetsSchema = z.object({
  mediaAssetIds: z.array(z.string().min(1)).min(1).max(100)
});

export type GalleryAssetView = {
  id: string;
  storageKey: string;
  publicUrl: string | null;
  originalName: string | null;
  mimeType: string;
  sizeBytes: string;
  visibility: MediaVisibility;
  caption?: string | null;
  commentsEnabled: boolean;
  createdAt: string;
  source?: string | null;
  collections: Array<{
    name: string;
    type: string;
  }>;
  tags: string[];
};

export type GalleryAssetNeighbor = {
  id: string;
  originalName: string | null;
};

export type GalleryAssetViewer = {
  asset: GalleryAssetView;
  comments: GalleryAssetCommentView[];
  previous: GalleryAssetNeighbor | null;
  next: GalleryAssetNeighbor | null;
};

export type GalleryAssetCommentView = {
  id: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl?: string | null;
  };
};
