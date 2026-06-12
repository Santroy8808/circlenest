import sanitizeHtml from "sanitize-html";
import { getDisplayMembershipTierName, normalizeMembershipTier } from "@/lib/policy/tier-policy";

const WRITERS_STUDIO_ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "a", "div", "span"];
const WRITERS_STUDIO_ALLOWED_ATTRIBUTES = {
  a: ["href", "target", "rel"],
};

export type WritersStudioChapterSummary = Readonly<{
  id: string;
  title: string;
  body: string;
  wordCount: number;
  orderIndex: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type WritersStudioProjectSummary = Readonly<{
  id: string;
  ownerId: string;
  title: string;
  summary: string | null;
  genre: string | null;
  format: string | null;
  accessTier: string;
  accessTierLabel: string;
  isPublic: boolean;
  chapterCount: number;
  createdAt: string;
  updatedAt: string;
  owner: Readonly<{
    id: string;
    username: string;
    fullName: string | null;
  }>;
}>;

export type WritersStudioProjectDetail = WritersStudioProjectSummary & Readonly<{
  chapters: WritersStudioChapterSummary[];
}>;

type WritersStudioProjectSummarySource = {
  id: string;
  ownerId: string;
  title: string;
  summary: string | null;
  genre: string | null;
  format: string | null;
  accessTier: string;
  isPublic: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  owner: {
    id: string;
    username: string;
    fullName: string | null;
  };
  _count?: {
    articles: number;
  };
};

type WritersStudioProjectDetailSource = WritersStudioProjectSummarySource & {
  articles: Array<{
    id: string;
    title: string;
    body: string;
    orderIndex: number;
    isPublished: boolean;
    createdAt: Date | string;
    updatedAt: Date | string;
  }>;
};

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function sanitizeWritersStudioHtml(input: string) {
  return sanitizeHtml(input, {
    allowedTags: WRITERS_STUDIO_ALLOWED_TAGS,
    allowedAttributes: WRITERS_STUDIO_ALLOWED_ATTRIBUTES,
  }).trim();
}

export function extractWritersStudioPlainText(input: string) {
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}

export function getWritersStudioWordCount(input: string) {
  const plainText = extractWritersStudioPlainText(input);
  if (!plainText) return 0;
  return plainText.split(/\s+/).filter(Boolean).length;
}

function serializeChapter(article: WritersStudioProjectDetailSource["articles"][number]): WritersStudioChapterSummary {
  const body = sanitizeWritersStudioHtml(article.body);
  return {
    id: article.id,
    title: article.title,
    body,
    wordCount: getWritersStudioWordCount(body),
    orderIndex: article.orderIndex,
    isPublished: article.isPublished,
    createdAt: normalizeDate(article.createdAt),
    updatedAt: normalizeDate(article.updatedAt),
  };
}

function serializeProjectBase(project: WritersStudioProjectSummarySource) {
  const accessTier = normalizeMembershipTier(project.accessTier);
  return {
    id: project.id,
    ownerId: project.ownerId,
    title: project.title,
    summary: project.summary,
    genre: project.genre,
    format: project.format,
    accessTier,
    accessTierLabel: getDisplayMembershipTierName(accessTier),
    isPublic: project.isPublic,
    chapterCount: project._count?.articles ?? 0,
    createdAt: normalizeDate(project.createdAt),
    updatedAt: normalizeDate(project.updatedAt),
    owner: {
      id: project.owner.id,
      username: project.owner.username,
      fullName: project.owner.fullName,
    },
  } satisfies WritersStudioProjectSummary;
}

export function serializeWritersStudioProject(project: WritersStudioProjectDetailSource): WritersStudioProjectDetail {
  return {
    ...serializeProjectBase(project),
    chapters: project.articles.map((article) => serializeChapter(article)),
  };
}

export function serializeWritersStudioProjectSummary(project: WritersStudioProjectSummarySource): WritersStudioProjectSummary {
  return serializeProjectBase(project);
}

export function serializeWritersStudioProjects(projects: WritersStudioProjectSummarySource[]): WritersStudioProjectSummary[] {
  return projects.map((project) => serializeWritersStudioProjectSummary(project));
}
