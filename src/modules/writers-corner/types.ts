import { ManuscriptVisibility } from "@prisma/client";
import { z } from "zod";

export const createManuscriptSchema = z.object({
  title: z.string().trim().min(2).max(140),
  genre: z.string().trim().max(80).optional(),
  summary: z.string().trim().optional(),
  visibility: z.nativeEnum(ManuscriptVisibility).default(ManuscriptVisibility.MEMBERS),
  publishToStorefront: z.boolean().default(false)
});

export const createChapterSchema = z.object({
  title: z.string().trim().min(2).max(140),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional().or(z.literal(""))
});

export const updateChapterSchema = z.object({
  title: z.string().trim().min(2).max(140),
  bodyText: z.string(),
  bodyHtml: z.string().optional().or(z.literal("")),
  autosave: z.boolean().optional()
});

export const updateManuscriptStorefrontPublishingSchema = z.object({
  publishToStorefront: z.boolean()
});

export const updateManuscriptSubscriptionSchema = z.object({
  notify: z.boolean().default(true)
});

export type WriterAccessState = {
  canWrite: boolean;
  canPublishToStorefront: boolean;
  reason?: string;
};

export type ManuscriptCardView = {
  id: string;
  slug: string;
  title: string;
  genre: string | null;
  summary: string | null;
  visibility: "PRIVATE" | "MEMBERS";
  publishToStorefront: boolean;
  storefrontPublishingAvailable: boolean;
  chapterCount: number;
  wordCount: number;
  subscriberCount: number;
  viewerSubscribed: boolean;
  updatedAt: string;
  viewerCanEdit: boolean;
  author: {
    username: string;
    displayName: string;
  };
};

export type ChapterCardView = {
  id: string;
  title: string;
  wordCount: number;
  sortOrder: number;
  updatedAt: string;
};

export type ManuscriptDetailView = ManuscriptCardView & {
  chapters: ChapterCardView[];
};

export type ChapterDetailView = ChapterCardView & {
  bodyText: string;
  bodyHtml: string | null;
  viewerCanEdit: boolean;
  manuscript: {
    id: string;
    slug: string;
    title: string;
  };
  previousChapter: ChapterCardView | null;
  nextChapter: ChapterCardView | null;
};
