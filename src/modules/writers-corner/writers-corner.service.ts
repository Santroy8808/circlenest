import { ManuscriptVisibility, Prisma, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  createChapterSchema,
  createManuscriptSchema,
  updateChapterSchema,
  type ChapterCardView,
  type ChapterDetailView,
  type ManuscriptCardView,
  type ManuscriptDetailView
} from "@/modules/writers-corner/types";

const MODULE_KEY = "writers-corner";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniqueManuscriptSlug(title: string) {
  const base = slugify(title) || "manuscript";
  let candidate = base;
  let index = 2;

  while (await prisma.writerManuscript.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function countWords(text: string) {
  const words = text.trim().match(/\S+/g);
  return words?.length ?? 0;
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

async function getViewerRole(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return user?.role ?? UserRole.MEMBER;
}

export async function getWriterAccessState(userId: string) {
  const role = await getViewerRole(userId);
  if (role === UserRole.ADMIN) return { canWrite: true };
  const access = await canUserAccessFeature(userId, "writers.access");
  return { canWrite: access.allowed, reason: access.reason };
}

type ManuscriptPayload = Prisma.WriterManuscriptGetPayload<{
  include: {
    author: { include: { profile: true } };
    chapters: true;
  };
}>;

function toManuscriptCard(manuscript: ManuscriptPayload, viewerUserId: string, viewerRole: UserRole): ManuscriptCardView {
  return {
    id: manuscript.id,
    slug: manuscript.slug,
    title: manuscript.title,
    genre: manuscript.genre,
    summary: manuscript.summary,
    visibility: manuscript.visibility,
    chapterCount: manuscript.chapters.length,
    wordCount: manuscript.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    updatedAt: manuscript.updatedAt.toISOString(),
    viewerCanEdit: viewerRole === UserRole.ADMIN || manuscript.authorUserId === viewerUserId,
    author: {
      username: manuscript.author.username,
      displayName: profileName(manuscript.author)
    }
  };
}

function toChapterCard(chapter: { id: string; title: string; wordCount: number; sortOrder: number; updatedAt: Date }): ChapterCardView {
  return {
    id: chapter.id,
    title: chapter.title,
    wordCount: chapter.wordCount,
    sortOrder: chapter.sortOrder,
    updatedAt: chapter.updatedAt.toISOString()
  };
}

export async function listManuscripts(viewerUserId: string) {
  const viewerRole = await getViewerRole(viewerUserId);
  const manuscripts = await prisma.writerManuscript.findMany({
    where: {
      OR: [{ visibility: ManuscriptVisibility.MEMBERS }, { authorUserId: viewerUserId }]
    },
    include: {
      author: {
        include: {
          profile: true
        }
      },
      chapters: true
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: 80
  });

  return manuscripts.map((manuscript) => toManuscriptCard(manuscript, viewerUserId, viewerRole));
}

export async function safeListManuscripts(viewerUserId: string) {
  try {
    return await listManuscripts(viewerUserId);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list manuscripts.", {
      viewerUserId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function createManuscript(userId: string, input: unknown) {
  const parsed = createManuscriptSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid manuscript." };
  }

  const access = await getWriterAccessState(userId);

  if (!access.canWrite) {
    return { ok: false as const, error: access.reason ?? "Contributor or Professional access required." };
  }

  const manuscript = await prisma.writerManuscript.create({
    data: {
      slug: await uniqueManuscriptSlug(parsed.data.title),
      authorUserId: userId,
      title: parsed.data.title,
      genre: parsed.data.genre || null,
      summary: parsed.data.summary || null,
      visibility: parsed.data.visibility
    }
  });

  await diagnostics.info(MODULE_KEY, "Manuscript created.", {
    userId,
    manuscriptId: manuscript.id
  });
  await writeAuditLog({
    actorUserId: userId,
    module: MODULE_KEY,
    action: "manuscript.created",
    targetType: "WriterManuscript",
    targetId: manuscript.id
  });

  return { ok: true as const, manuscript };
}

export async function getManuscriptDetail(viewerUserId: string, manuscriptIdOrSlug: string) {
  const viewerRole = await getViewerRole(viewerUserId);
  const manuscript = await prisma.writerManuscript.findFirst({
    where: {
      AND: [
        { OR: [{ id: manuscriptIdOrSlug }, { slug: manuscriptIdOrSlug }] },
        { OR: [{ visibility: ManuscriptVisibility.MEMBERS }, { authorUserId: viewerUserId }] }
      ]
    },
    include: {
      author: {
        include: {
          profile: true
        }
      },
      chapters: {
        orderBy: {
          sortOrder: "asc"
        }
      }
    }
  });

  if (!manuscript) {
    return { ok: false as const, error: "Manuscript not found." };
  }

  const detail: ManuscriptDetailView = {
    ...toManuscriptCard(manuscript, viewerUserId, viewerRole),
    chapters: manuscript.chapters.map(toChapterCard)
  };

  return { ok: true as const, manuscript: detail };
}

export async function safeGetManuscriptDetail(viewerUserId: string, manuscriptIdOrSlug: string) {
  try {
    return await getManuscriptDetail(viewerUserId, manuscriptIdOrSlug);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load manuscript.", {
      viewerUserId,
      manuscriptIdOrSlug,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load manuscript." };
  }
}

export async function createChapter(userId: string, manuscriptIdOrSlug: string, input: unknown) {
  const parsed = createChapterSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid chapter." };
  }

  const viewerRole = await getViewerRole(userId);
  const manuscript = await prisma.writerManuscript.findFirst({
    where: {
      OR: [{ id: manuscriptIdOrSlug }, { slug: manuscriptIdOrSlug }]
    },
    include: {
      chapters: {
        orderBy: {
          sortOrder: "desc"
        },
        take: 1
      }
    }
  });

  if (!manuscript) return { ok: false as const, error: "Manuscript not found." };
  if (viewerRole !== UserRole.ADMIN && manuscript.authorUserId !== userId) {
    return { ok: false as const, error: "Only the manuscript creator can add chapters." };
  }

  const bodyText = parsed.data.bodyText ?? "";
  const chapter = await prisma.writerChapter.create({
    data: {
      manuscriptId: manuscript.id,
      title: parsed.data.title,
      bodyText,
      wordCount: countWords(bodyText),
      sortOrder: (manuscript.chapters[0]?.sortOrder ?? 0) + 1,
      publishedAt: new Date()
    }
  });

  await diagnostics.info(MODULE_KEY, "Chapter created.", {
    userId,
    manuscriptId: manuscript.id,
    chapterId: chapter.id
  });

  return { ok: true as const, chapter };
}

export async function getChapterDetail(viewerUserId: string, chapterId: string) {
  const viewerRole = await getViewerRole(viewerUserId);
  const chapter = await prisma.writerChapter.findUnique({
    where: { id: chapterId },
    include: {
      manuscript: {
        include: {
          chapters: {
            orderBy: {
              sortOrder: "asc"
            }
          }
        }
      }
    }
  });

  if (!chapter) return { ok: false as const, error: "Chapter not found." };
  const canView = chapter.manuscript.visibility === ManuscriptVisibility.MEMBERS || chapter.manuscript.authorUserId === viewerUserId;

  if (!canView) return { ok: false as const, error: "Chapter not found." };

  const chapters = chapter.manuscript.chapters.map(toChapterCard);
  const currentIndex = chapters.findIndex((item) => item.id === chapter.id);
  const detail: ChapterDetailView = {
    ...toChapterCard(chapter),
    bodyText: chapter.bodyText,
    viewerCanEdit: viewerRole === UserRole.ADMIN || chapter.manuscript.authorUserId === viewerUserId,
    manuscript: {
      id: chapter.manuscript.id,
      slug: chapter.manuscript.slug,
      title: chapter.manuscript.title
    },
    previousChapter: currentIndex > 0 ? chapters[currentIndex - 1] : null,
    nextChapter: currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null
  };

  return { ok: true as const, chapter: detail };
}

export async function safeGetChapterDetail(viewerUserId: string, chapterId: string) {
  try {
    return await getChapterDetail(viewerUserId, chapterId);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load chapter.", {
      viewerUserId,
      chapterId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load chapter." };
  }
}

export async function updateChapter(userId: string, chapterId: string, input: unknown) {
  const parsed = updateChapterSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid chapter." };
  }

  const existing = await prisma.writerChapter.findUnique({
    where: { id: chapterId },
    include: {
      manuscript: true
    }
  });
  const viewerRole = await getViewerRole(userId);

  if (!existing) return { ok: false as const, error: "Chapter not found." };
  if (viewerRole !== UserRole.ADMIN && existing.manuscript.authorUserId !== userId) {
    return { ok: false as const, error: "Only the manuscript creator can edit this chapter." };
  }

  const chapter = await prisma.writerChapter.update({
    where: { id: chapterId },
    data: {
      title: parsed.data.title,
      bodyText: parsed.data.bodyText,
      wordCount: countWords(parsed.data.bodyText),
      autosavedAt: parsed.data.autosave ? new Date() : existing.autosavedAt
    }
  });

  await diagnostics.debug(MODULE_KEY, parsed.data.autosave ? "Chapter autosaved." : "Chapter saved.", {
    userId,
    chapterId: chapter.id
  });

  return { ok: true as const, chapter };
}
