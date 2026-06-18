import { ManuscriptVisibility } from "@prisma/client";
import { z } from "zod";

export const createManuscriptSchema = z.object({
  title: z.string().trim().min(2).max(140),
  genre: z.string().trim().max(80).optional(),
  summary: z.string().trim().max(800).optional(),
  visibility: z.nativeEnum(ManuscriptVisibility).default(ManuscriptVisibility.MEMBERS)
});

export const createChapterSchema = z.object({
  title: z.string().trim().min(2).max(140),
  bodyText: z.string().max(100000).optional()
});

export const updateChapterSchema = z.object({
  title: z.string().trim().min(2).max(140),
  bodyText: z.string().max(100000),
  autosave: z.boolean().optional()
});

export type WriterAccessState = {
  canWrite: boolean;
  reason?: string;
};

export type ManuscriptCardView = {
  id: string;
  slug: string;
  title: string;
  genre: string | null;
  summary: string | null;
  visibility: "PRIVATE" | "MEMBERS";
  chapterCount: number;
  wordCount: number;
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
  viewerCanEdit: boolean;
  manuscript: {
    id: string;
    slug: string;
    title: string;
  };
  previousChapter: ChapterCardView | null;
  nextChapter: ChapterCardView | null;
};
