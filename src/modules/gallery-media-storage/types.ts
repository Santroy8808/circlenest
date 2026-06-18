import { MediaVisibility } from "@prisma/client";
import { z } from "zod";

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

export const createUploadIntentSchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string().regex(/^image\/(jpeg|png|gif|webp)$/),
  sizeBytes: z.number().int().positive().max(MAX_IMAGE_UPLOAD_BYTES),
  visibility: z.nativeEnum(MediaVisibility).default(MediaVisibility.PRIVATE)
});

export const completeUploadSchema = createUploadIntentSchema.extend({
  storageKey: z.string().min(1).max(600),
  caption: z.string().max(500).optional().or(z.literal("")),
  tags: z.array(z.string().min(1).max(40)).max(20).default([])
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
  createdAt: string;
  collections: Array<{
    name: string;
    type: string;
  }>;
};
