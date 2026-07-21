import { ManuscriptVisibility, NotificationKind, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  createChapterSchema,
  createManuscriptSchema,
  updateChapterSchema,
  updateManuscriptStorefrontPublishingSchema,
  updateManuscriptSubscriptionSchema,
  type ChapterCardView,
  type ChapterDetailView,
  type ManuscriptCardView,
  type ManuscriptDetailView
} from "@/modules/writers-corner/types";

const MODULE_KEY = "writers-corner";
const WRITER_TRANSACTION_RETRIES = 3;

export function nextWriterChapterSortOrder(lastSortOrder: number | null | undefined) {
  return (lastSortOrder ?? 0) + 1;
}

export function writerAccessAllowsRead(access: { canRead: boolean }) {
  return access.canRead;
}

export function writerAccessAllowsWrite(access: { canWrite: boolean }) {
  return access.canWrite;
}

export function writerCanEditOwnedContent(input: {
  viewerUserId: string;
  authorUserId: string;
  canWrite: boolean;
}) {
  return input.canWrite && input.viewerUserId === input.authorUserId;
}

async function runSerializableWriterTransaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; attempt <= WRITER_TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === WRITER_TRANSACTION_RETRIES) throw error;
    }
  }

  throw new Error("Writer transaction retry limit reached.");
}

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

function plainTextFromHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeCssColor(value: string) {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/.test(normalized)) return normalized;

  const rgb = /^rgba?\(([^)]+)\)$/.exec(normalized);
  if (!rgb) return null;

  const channels = rgb[1].split(",").map((channel) => channel.trim());
  const expectedChannels = normalized.startsWith("rgba") ? 4 : 3;
  if (channels.length !== expectedChannels) return null;

  const colorChannels = channels.slice(0, 3).map(Number);
  if (colorChannels.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) return null;

  if (expectedChannels === 4) {
    const alpha = Number(channels[3]);
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
  }

  return `${expectedChannels === 4 ? "rgba" : "rgb"}(${channels.join(", ")})`;
}

function safeRichTextStyle(rawAttrs: string) {
  const rawStyle = /style=(["'])(.*?)\1/i.exec(rawAttrs)?.[2] ?? "";
  const safeDeclarations: string[] = [];

  for (const declaration of rawStyle.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;

    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim().toLowerCase();

    if (property === "color" || property === "background-color") {
      const safeColor = safeCssColor(value);
      if (safeColor) safeDeclarations.push(`${property}: ${safeColor}`);
      continue;
    }

    if (property === "text-align" && ["left", "center", "right", "justify"].includes(value)) {
      safeDeclarations.push(`text-align: ${value}`);
      continue;
    }

    if (property === "margin-left") {
      const margin = /^(\d{1,3})px$/.exec(value);
      if (margin && Number(margin[1]) <= 320) safeDeclarations.push(`margin-left: ${Number(margin[1])}px`);
    }
  }

  return safeDeclarations.length > 0 ? ` style="${safeDeclarations.join("; ")}"` : "";
}

function sanitizeRichTextHtml(html?: string | null) {
  if (!html) return null;

  let clean = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\son\w+=\S+/gi, "");

  clean = clean.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    const allowed = new Set([
      "p",
      "div",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "span",
      "font",
      "ul",
      "ol",
      "li",
      "blockquote",
      "h2",
      "h3",
      "pre",
      "code",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "a",
      "img"
    ]);
    if (!allowed.has(tag)) return "";
    if (tag === "img") {
      if (match.startsWith("</")) return "";
      const src = /src=(["'])(.*?)\1/i.exec(rawAttrs)?.[2] ?? "";
      if (!src || (!src.startsWith("https://") && !src.startsWith("http://") && !src.startsWith("/"))) return "";

      const alt = /alt=(["'])(.*?)\1/i.exec(rawAttrs)?.[2] ?? "Blog image";
      const classValue = /class=(["'])(.*?)\1/i.exec(rawAttrs)?.[2] ?? "";
      const classes = classValue
        .split(/\s+/)
        .filter((className) =>
          ["rich-text-image", "rich-text-image-left", "rich-text-image-center", "rich-text-image-right", "rich-text-image-full"].includes(className)
        );
      if (!classes.includes("rich-text-image")) classes.unshift("rich-text-image");
      if (!classes.some((className) => className.startsWith("rich-text-image-") && className !== "rich-text-image")) {
        classes.push("rich-text-image-center");
      }

      const safeSrc = escapeHtmlAttribute(src).slice(0, 1000);
      const safeAlt = escapeHtmlAttribute(alt).slice(0, 160);
      return `<img src="${safeSrc}" alt="${safeAlt}" class="${classes.join(" ")}" loading="lazy">`;
    }
    if (tag === "font") {
      if (match.startsWith("</")) return "</span>";
      const color = /color=(["'])(.*?)\1/i.exec(rawAttrs)?.[2] ?? "";
      const safeColor = safeCssColor(color);
      return safeColor ? `<span style="color: ${safeColor}">` : "<span>";
    }
    if (tag !== "a" || match.startsWith("</")) {
      return match.startsWith("</") ? `</${tag}>` : `<${tag}${safeRichTextStyle(rawAttrs)}>`;
    }

    const href = /href=(["'])(.*?)\1/i.exec(rawAttrs)?.[2] ?? "";
    if (!href || (!href.startsWith("https://") && !href.startsWith("http://") && !href.startsWith("/"))) return "<a>";
    const safeHref = href.replace(/"/g, "%22");
    return `<a href="${safeHref}" rel="noreferrer" target="_blank"${safeRichTextStyle(rawAttrs)}>`;
  });

  return clean.trim() || null;
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

async function getStorefrontOwnerUserIdsForPublisher(userId: string) {
  const accounts = await prisma.businessAccount.findMany({
    where: {
      privateUserId: userId,
      active: true
    },
    select: {
      businessUserId: true
    }
  });

  return [...new Set([userId, ...accounts.map((account) => account.businessUserId)])];
}

async function canPublishToStorefront(userId: string) {
  const entitlement = await canUserAccessFeature(userId, "market.storefront");
  if (!entitlement.allowed) return false;
  const ownerUserIds = await getStorefrontOwnerUserIdsForPublisher(userId);
  const profile = await prisma.businessProfile.findFirst({
    where: {
      ownerUserId: {
        in: ownerUserIds
      },
      publicStorefrontEnabled: true,
      blogEnabled: true
    },
    select: {
      id: true
    }
  });

  return writerStorefrontPublishingAllowed({
    hasStorefrontEntitlement: entitlement.allowed,
    hasEnabledStorefront: Boolean(profile)
  });
}

export function writerStorefrontPublishingAllowed(input: {
  hasStorefrontEntitlement: boolean;
  hasEnabledStorefront: boolean;
}) {
  return input.hasStorefrontEntitlement && input.hasEnabledStorefront;
}

export async function getWriterAccessState(userId: string) {
  const access = await canUserAccessFeature(userId, "writers.access");
  return {
    canRead: true,
    canWrite: access.allowed,
    canPublishToStorefront: access.allowed ? await canPublishToStorefront(userId) : false,
    reason: access.reason
  };
}

type ManuscriptPayload = Prisma.WriterManuscriptGetPayload<{
  include: {
    author: { include: { profile: true } };
    chapters: true;
    subscriptions: true;
  };
}>;

function toManuscriptCard(
  manuscript: ManuscriptPayload,
  viewerUserId: string,
  viewerCanWrite: boolean,
  storefrontPublishingAvailable = false
): ManuscriptCardView {
  return {
    id: manuscript.id,
    slug: manuscript.slug,
    title: manuscript.title,
    genre: manuscript.genre,
    summary: manuscript.summary,
    visibility: manuscript.visibility,
    publishToStorefront: manuscript.publishToStorefront,
    storefrontPublishingAvailable,
    chapterCount: manuscript.chapters.length,
    wordCount: manuscript.chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    subscriberCount: manuscript.subscriptions.length,
    viewerSubscribed: manuscript.subscriptions.some((subscription) => subscription.userId === viewerUserId),
    updatedAt: manuscript.updatedAt.toISOString(),
    viewerCanEdit: writerCanEditOwnedContent({
      viewerUserId,
      authorUserId: manuscript.authorUserId,
      canWrite: viewerCanWrite
    }),
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
  const access = await getWriterAccessState(viewerUserId);
  if (!writerAccessAllowsRead(access)) return [];

  const storefrontPublishingAvailable = await canPublishToStorefront(viewerUserId);
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
      chapters: true,
      subscriptions: true
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: 80
  });

  return manuscripts.map((manuscript) =>
    toManuscriptCard(
      manuscript,
      viewerUserId,
      access.canWrite,
      manuscript.authorUserId === viewerUserId && storefrontPublishingAvailable
    )
  );
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

  const storefrontPublishingAvailable = await canPublishToStorefront(userId);
  if (parsed.data.publishToStorefront && !storefrontPublishingAvailable) {
    return { ok: false as const, error: "Enable storefront blogs in Business Center before publishing this manuscript to your storefront." };
  }

  const manuscript = await prisma.writerManuscript.create({
    data: {
      slug: await uniqueManuscriptSlug(parsed.data.title),
      authorUserId: userId,
      title: parsed.data.title,
      genre: parsed.data.genre || null,
      summary: parsed.data.summary || null,
      visibility: parsed.data.visibility,
      publishToStorefront: parsed.data.publishToStorefront
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
  const access = await getWriterAccessState(viewerUserId);
  if (!writerAccessAllowsRead(access)) return { ok: false as const, error: "Manuscript not found." };

  const storefrontPublishingAvailable = await canPublishToStorefront(viewerUserId);
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
      },
      subscriptions: true
    }
  });

  if (!manuscript) {
    return { ok: false as const, error: "Manuscript not found." };
  }

  const detail: ManuscriptDetailView = {
    ...toManuscriptCard(
      manuscript,
      viewerUserId,
      access.canWrite,
      manuscript.authorUserId === viewerUserId && storefrontPublishingAvailable
    ),
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

export async function updateManuscriptStorefrontPublishing(userId: string, manuscriptIdOrSlug: string, input: unknown) {
  const parsed = updateManuscriptStorefrontPublishingSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid storefront publishing setting." };
  }

  const access = await getWriterAccessState(userId);
  if (!writerAccessAllowsWrite(access)) {
    return { ok: false as const, error: access.reason ?? "Contributor access required." };
  }

  const manuscript = await prisma.writerManuscript.findFirst({
    where: {
      OR: [{ id: manuscriptIdOrSlug }, { slug: manuscriptIdOrSlug }]
    },
    select: {
      id: true,
      authorUserId: true
    }
  });

  if (!manuscript) return { ok: false as const, error: "Manuscript not found." };
  if (!writerCanEditOwnedContent({ viewerUserId: userId, authorUserId: manuscript.authorUserId, canWrite: access.canWrite })) {
    return { ok: false as const, error: "Only the manuscript creator can change storefront publishing." };
  }

  if (parsed.data.publishToStorefront && !(await canPublishToStorefront(manuscript.authorUserId))) {
    return { ok: false as const, error: "Enable storefront blogs in Business Center before publishing this manuscript to your storefront." };
  }

  const updated = await prisma.writerManuscript.update({
    where: { id: manuscript.id },
    data: {
      publishToStorefront: parsed.data.publishToStorefront
    },
    include: {
      author: {
        include: {
          profile: true
        }
      },
      chapters: true,
      subscriptions: true
    }
  });

  await diagnostics.info(MODULE_KEY, "Manuscript storefront publishing updated.", {
    userId,
    manuscriptId: updated.id,
    publishToStorefront: updated.publishToStorefront
  });
  await writeAuditLog({
    actorUserId: userId,
    module: MODULE_KEY,
    action: "manuscript.storefrontPublishing.updated",
    targetType: "WriterManuscript",
    targetId: updated.id,
    metadata: {
      publishToStorefront: updated.publishToStorefront
    }
  });

  return {
    ok: true as const,
    manuscript: toManuscriptCard(updated, userId, access.canWrite, await canPublishToStorefront(updated.authorUserId))
  };
}

export async function createChapter(userId: string, manuscriptIdOrSlug: string, input: unknown) {
  const parsed = createChapterSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid chapter." };
  }

  const access = await getWriterAccessState(userId);
  if (!writerAccessAllowsWrite(access)) {
    return { ok: false as const, error: access.reason ?? "Contributor access required." };
  }

  const bodyHtml = sanitizeRichTextHtml(parsed.data.bodyHtml);
  const bodyText = (parsed.data.bodyText ?? plainTextFromHtml(bodyHtml ?? "")).trim();
  const creation = await runSerializableWriterTransaction(async (transaction) => {
    const manuscript = await transaction.writerManuscript.findFirst({
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
    if (!writerCanEditOwnedContent({ viewerUserId: userId, authorUserId: manuscript.authorUserId, canWrite: access.canWrite })) {
      return { ok: false as const, error: "Only the manuscript creator can add chapters." };
    }

    const createdChapter = await transaction.writerChapter.create({
      data: {
        manuscriptId: manuscript.id,
        title: parsed.data.title,
        bodyText,
        bodyHtml,
        wordCount: countWords(bodyText),
        sortOrder: nextWriterChapterSortOrder(manuscript.chapters[0]?.sortOrder),
        publishedAt: new Date()
      }
    });

    const subscribers = await transaction.writerManuscriptSubscription.findMany({
      where: {
        manuscriptId: manuscript.id,
        notify: true,
        userId: { not: manuscript.authorUserId }
      },
      select: { userId: true }
    });

    if (subscribers.length > 0) {
      await transaction.notification.createMany({
        data: subscribers.map((subscriber) => ({
          idempotencyKey: `writer-chapter:${createdChapter.id}:${subscriber.userId}`,
          kind: NotificationKind.WRITER_CHAPTER_PUBLISHED,
          sourceType: "WriterChapter",
          sourceId: createdChapter.id,
          actionable: true,
          userId: subscriber.userId,
          title: `New chapter: ${parsed.data.title}`,
          body: `${manuscript.title} has a new chapter ready to read.`,
          href: `/writers-corner/${manuscript.slug}/chapters/${createdChapter.id}`
        })),
        skipDuplicates: true
      });
    }

    return { ok: true as const, chapter: createdChapter, manuscriptId: manuscript.id };
  });

  if (!creation.ok) return creation;

  await diagnostics.info(MODULE_KEY, "Chapter created.", {
    userId,
    manuscriptId: creation.manuscriptId,
    chapterId: creation.chapter.id
  });

  return { ok: true as const, chapter: creation.chapter };
}

export async function subscribeToManuscript(userId: string, manuscriptIdOrSlug: string, input: unknown) {
  const access = await getWriterAccessState(userId);
  if (!writerAccessAllowsRead(access)) return { ok: false as const, error: "Manuscript not found." };

  const parsed = updateManuscriptSubscriptionSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid subscription." };
  }

  const manuscript = await prisma.writerManuscript.findFirst({
    where: {
      OR: [{ id: manuscriptIdOrSlug }, { slug: manuscriptIdOrSlug }],
      visibility: ManuscriptVisibility.MEMBERS
    },
    select: {
      id: true,
      authorUserId: true
    }
  });

  if (!manuscript) return { ok: false as const, error: "Manuscript not found." };
  if (manuscript.authorUserId === userId) {
    return { ok: false as const, error: "You already receive creator access for this manuscript." };
  }

  const subscription = await prisma.writerManuscriptSubscription.upsert({
    where: {
      manuscriptId_userId: {
        manuscriptId: manuscript.id,
        userId
      }
    },
    update: {
      notify: parsed.data.notify
    },
    create: {
      manuscriptId: manuscript.id,
      userId,
      notify: parsed.data.notify
    }
  });

  return { ok: true as const, subscription };
}

export async function unsubscribeFromManuscript(userId: string, manuscriptIdOrSlug: string) {
  const access = await getWriterAccessState(userId);
  if (!writerAccessAllowsRead(access)) return { ok: false as const, error: "Manuscript not found." };

  const manuscript = await prisma.writerManuscript.findFirst({
    where: {
      OR: [{ id: manuscriptIdOrSlug }, { slug: manuscriptIdOrSlug }]
    },
    select: { id: true }
  });

  if (!manuscript) return { ok: false as const, error: "Manuscript not found." };

  await prisma.writerManuscriptSubscription.deleteMany({
    where: {
      manuscriptId: manuscript.id,
      userId
    }
  });

  return { ok: true as const };
}

export async function getChapterDetail(viewerUserId: string, chapterId: string) {
  const access = await getWriterAccessState(viewerUserId);
  if (!writerAccessAllowsRead(access)) return { ok: false as const, error: "Chapter not found." };

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
    bodyHtml: chapter.bodyHtml,
    viewerCanEdit: writerCanEditOwnedContent({
      viewerUserId,
      authorUserId: chapter.manuscript.authorUserId,
      canWrite: access.canWrite
    }),
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

  const access = await getWriterAccessState(userId);
  if (!writerAccessAllowsWrite(access)) {
    return { ok: false as const, error: access.reason ?? "Contributor access required." };
  }

  const existing = await prisma.writerChapter.findUnique({
    where: { id: chapterId },
    include: {
      manuscript: true
    }
  });
  if (!existing) return { ok: false as const, error: "Chapter not found." };
  if (!writerCanEditOwnedContent({ viewerUserId: userId, authorUserId: existing.manuscript.authorUserId, canWrite: access.canWrite })) {
    return { ok: false as const, error: "Only the manuscript creator can edit this chapter." };
  }

  const chapter = await prisma.writerChapter.update({
    where: { id: chapterId },
    data: {
      title: parsed.data.title,
      bodyText: parsed.data.bodyText,
      bodyHtml: sanitizeRichTextHtml(parsed.data.bodyHtml),
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
