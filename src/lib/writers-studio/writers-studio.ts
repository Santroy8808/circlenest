export type WritersStudioArticleSummary = Readonly<{
  id: string;
  title: string;
  body: string;
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
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  owner: Readonly<{
    id: string;
    username: string;
    fullName: string | null;
  }>;
  articles: WritersStudioArticleSummary[];
}>;

type WritersStudioProjectSource = {
  id: string;
  ownerId: string;
  title: string;
  summary: string | null;
  genre: string | null;
  format: string | null;
  isPublic: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  owner: {
    id: string;
    username: string;
    fullName: string | null;
  };
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

function serializeArticle(article: WritersStudioProjectSource["articles"][number]): WritersStudioArticleSummary {
  return {
    id: article.id,
    title: article.title,
    body: article.body,
    orderIndex: article.orderIndex,
    isPublished: article.isPublished,
    createdAt: normalizeDate(article.createdAt),
    updatedAt: normalizeDate(article.updatedAt),
  };
}

export function serializeWritersStudioProject(project: WritersStudioProjectSource): WritersStudioProjectSummary {
  return {
    id: project.id,
    ownerId: project.ownerId,
    title: project.title,
    summary: project.summary,
    genre: project.genre,
    format: project.format,
    isPublic: project.isPublic,
    createdAt: normalizeDate(project.createdAt),
    updatedAt: normalizeDate(project.updatedAt),
    owner: {
      id: project.owner.id,
      username: project.owner.username,
      fullName: project.owner.fullName,
    },
    articles: project.articles.map((article) => serializeArticle(article)),
  };
}

export function serializeWritersStudioProjects(projects: WritersStudioProjectSource[]): WritersStudioProjectSummary[] {
  return projects.map((project) => serializeWritersStudioProject(project));
}
