import { FeedVisibility, Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/platform/audit";
import { prisma } from "@/lib/platform/db";
import { isAdminRole } from "@/lib/platform/roles";

const MODULE_KEY = "feed-retention";

export const FREE_TIER_PERSONAL_STORAGE_BYTES = 200 * 1024 * 1024;

export const streamRetentionPolicy = {
  compressionAfterUnviewedHours: 48,
  archiveAfterDays: 7,
  deleteAfterDays: 90,
  note:
    "Public stream posts are subject to compression after 48 hours without a view, archive after 1 week, and permanent thread deletion after 3 months unless an admin hold is present. Limits are subject to change."
} as const;

const holdSchema = z.object({
  postId: z.string().trim().min(1),
  reason: z.string().trim().min(5).max(1000),
  holdThread: z.boolean().default(true)
});

const postIdSchema = z.object({
  postId: z.string().trim().min(1)
});

const booleanQueryParam = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }, z.boolean().default(defaultValue));

const searchSchema = z.object({
  query: z.string().trim().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  includeArchived: booleanQueryParam(true),
  includeDeleted: booleanQueryParam(true),
  heldOnly: booleanQueryParam(false)
});

const importedThreadSchema = z.object({
  exportedAt: z.string(),
  source: z.literal("theta-space.feed-thread.v1"),
  post: z.record(z.unknown()),
  comments: z.array(z.record(z.unknown())).default([]),
  postReactions: z.array(z.record(z.unknown())).default([]),
  commentReactions: z.array(z.record(z.unknown())).default([]),
  postHashtags: z.array(z.record(z.unknown())).default([]),
  commentHashtags: z.array(z.record(z.unknown())).default([])
});

type AdminFeedPostSearchResult = {
  id: string;
  bodyPreview: string;
  author: string;
  authorUsername: string;
  createdAt: string;
  visibility: FeedVisibility;
  mediaAssetId: string | null;
  streamCompressedAt: string | null;
  streamArchivedAt: string | null;
  streamDeletedAt: string | null;
  adminHoldAt: string | null;
  adminHoldReason: string | null;
  adminHoldThread: boolean;
};

async function requireAdmin(actorUserId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { role: true }
  });

  return isAdminRole(actor?.role) ? { ok: true as const } : { ok: false as const, error: "Admin access required." };
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(now: Date, hours: number) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function publicStreamWhere(extra: Prisma.FeedPostWhereInput = {}): Prisma.FeedPostWhereInput {
  return {
    ...extra,
    visibility: FeedVisibility.MEMBERS,
    targetProfileUserId: null,
    isAdminAnnouncement: false
  };
}

function bodyPreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized || "(media-only post)";
}

export async function markFeedPostsViewed(postIds: string[]) {
  const uniqueIds = [...new Set(postIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  await prisma.feedPost.updateMany({
    where: {
      id: { in: uniqueIds },
      streamDeletedAt: null
    },
    data: { lastViewedAt: new Date() }
  });
}

export async function applyPublicStreamRetentionPolicy(actorUserId?: string) {
  if (actorUserId) {
    const admin = await requireAdmin(actorUserId);
    if (!admin.ok) return admin;
  }

  const now = new Date();
  const compressionCutoff = hoursAgo(now, streamRetentionPolicy.compressionAfterUnviewedHours);
  const archiveCutoff = daysAgo(now, streamRetentionPolicy.archiveAfterDays);
  const deleteCutoff = daysAgo(now, streamRetentionPolicy.deleteAfterDays);

  const compressed = await prisma.feedPost.updateMany({
    where: publicStreamWhere({
      mediaAssetId: { not: null },
      streamCompressedAt: null,
      streamArchivedAt: null,
      streamDeletedAt: null,
      adminHoldAt: null,
      OR: [
        { lastViewedAt: null, createdAt: { lte: compressionCutoff } },
        { lastViewedAt: { lte: compressionCutoff } }
      ]
    }),
    data: { streamCompressedAt: now }
  });

  const archived = await prisma.feedPost.updateMany({
    where: publicStreamWhere({
      streamArchivedAt: null,
      streamDeletedAt: null,
      adminHoldAt: null,
      createdAt: { lte: archiveCutoff }
    }),
    data: { streamArchivedAt: now }
  });

  const deleted = await prisma.feedPost.updateMany({
    where: publicStreamWhere({
      adminHoldAt: null,
      createdAt: { lte: deleteCutoff }
    }),
    data: { streamDeletedAt: now }
  });

  const permanentlyDeleted = await prisma.feedPost.deleteMany({
    where: publicStreamWhere({
      adminHoldAt: null,
      createdAt: { lte: deleteCutoff }
    })
  });

  if (actorUserId) {
    await writeAuditLog({
      actorUserId,
      module: MODULE_KEY,
      action: "stream.retention_applied",
      targetType: "FeedPost",
      severity: "warning",
      metadata: {
        compressedCount: compressed.count,
        archivedCount: archived.count,
        deletedCount: deleted.count,
        permanentlyDeletedCount: permanentlyDeleted.count,
        policy: streamRetentionPolicy
      }
    });
  }

  return {
    ok: true as const,
    compressedCount: compressed.count,
    archivedCount: archived.count,
    deletedCount: deleted.count,
    permanentlyDeletedCount: permanentlyDeleted.count
  };
}

export async function searchAdminFeedThreads(actorUserId: string, input: unknown) {
  const admin = await requireAdmin(actorUserId);
  if (!admin.ok) return admin;

  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid search." };
  }

  const query = parsed.data.query;
  const where: Prisma.FeedPostWhereInput = {
    ...(parsed.data.heldOnly ? { adminHoldAt: { not: null } } : {}),
    ...(parsed.data.includeArchived ? {} : { streamArchivedAt: null }),
    ...(parsed.data.includeDeleted ? {} : { streamDeletedAt: null }),
    ...(query
      ? {
          OR: [
            { id: query },
            { body: { contains: query, mode: "insensitive" } },
            { author: { is: { username: { contains: query.replace(/^@/, ""), mode: "insensitive" } } } },
            { author: { is: { email: { contains: query, mode: "insensitive" } } } },
            { author: { is: { profile: { is: { displayName: { contains: query, mode: "insensitive" } } } } } }
          ]
        }
      : {})
  };

  const posts = await prisma.feedPost.findMany({
    where,
    include: {
      author: {
        include: { profile: true }
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: parsed.data.limit
  });

  const results: AdminFeedPostSearchResult[] = posts.map((post) => ({
    id: post.id,
    bodyPreview: bodyPreview(post.body),
    author: post.author.profile?.displayName ?? post.author.username,
    authorUsername: post.author.username,
    createdAt: post.createdAt.toISOString(),
    visibility: post.visibility,
    mediaAssetId: post.mediaAssetId,
    streamCompressedAt: post.streamCompressedAt?.toISOString() ?? null,
    streamArchivedAt: post.streamArchivedAt?.toISOString() ?? null,
    streamDeletedAt: post.streamDeletedAt?.toISOString() ?? null,
    adminHoldAt: post.adminHoldAt?.toISOString() ?? null,
    adminHoldReason: post.adminHoldReason,
    adminHoldThread: post.adminHoldThread
  }));

  return { ok: true as const, results };
}

export async function holdFeedThread(actorUserId: string, input: unknown) {
  const admin = await requireAdmin(actorUserId);
  if (!admin.ok) return admin;

  const parsed = holdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid hold request." };
  }

  const now = new Date();
  const updated = await prisma.feedPost.updateMany({
    where: { id: parsed.data.postId },
    data: {
      adminHoldAt: now,
      adminHoldByUserId: actorUserId,
      adminHoldReason: parsed.data.reason,
      adminHoldThread: parsed.data.holdThread
    }
  });

  if (updated.count === 0) {
    return { ok: false as const, error: "Post was not found." };
  }

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "stream.post_held",
    targetType: "FeedPost",
    targetId: parsed.data.postId,
    severity: "critical",
    metadata: parsed.data
  });

  return { ok: true as const };
}

export async function releaseFeedThreadHold(actorUserId: string, input: unknown) {
  const admin = await requireAdmin(actorUserId);
  if (!admin.ok) return admin;

  const parsed = postIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid post id." };
  }

  const updated = await prisma.feedPost.updateMany({
    where: { id: parsed.data.postId },
    data: {
      adminHoldAt: null,
      adminHoldByUserId: null,
      adminHoldReason: null,
      adminHoldThread: true
    }
  });

  if (updated.count === 0) {
    return { ok: false as const, error: "Post was not found." };
  }

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "stream.post_hold_released",
    targetType: "FeedPost",
    targetId: parsed.data.postId,
    severity: "warning"
  });

  return { ok: true as const };
}

export async function exportFeedThread(actorUserId: string, input: unknown) {
  const admin = await requireAdmin(actorUserId);
  if (!admin.ok) return admin;

  const parsed = postIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid post id." };
  }

  const [post, comments, postReactions, commentReactions, postHashtags, commentHashtags] = await Promise.all([
    prisma.feedPost.findUnique({ where: { id: parsed.data.postId } }),
    prisma.feedComment.findMany({ where: { postId: parsed.data.postId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.feedPostReaction.findMany({ where: { postId: parsed.data.postId } }),
    prisma.feedCommentReaction.findMany({ where: { comment: { is: { postId: parsed.data.postId } } } }),
    prisma.feedPostHashtag.findMany({ where: { postId: parsed.data.postId } }),
    prisma.feedCommentHashtag.findMany({ where: { comment: { is: { postId: parsed.data.postId } } } })
  ]);

  if (!post) {
    return { ok: false as const, error: "Post was not found." };
  }

  const exported = {
    source: "theta-space.feed-thread.v1" as const,
    exportedAt: new Date().toISOString(),
    policy: streamRetentionPolicy,
    post,
    comments,
    postReactions,
    commentReactions,
    postHashtags,
    commentHashtags
  };

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "stream.thread_exported",
    targetType: "FeedPost",
    targetId: parsed.data.postId,
    severity: "warning",
    metadata: {
      commentCount: comments.length,
      postReactionCount: postReactions.length,
      commentReactionCount: commentReactions.length
    }
  });

  return { ok: true as const, thread: exported };
}

export async function importFeedThread(actorUserId: string, input: unknown) {
  const admin = await requireAdmin(actorUserId);
  if (!admin.ok) return admin;

  const parsed = importedThreadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid import payload." };
  }

  const post = parsed.data.post as Prisma.FeedPostUncheckedCreateInput;
  if (!post.id) return { ok: false as const, error: "Import payload is missing the post id." };

  const existing = await prisma.feedPost.findUnique({ where: { id: String(post.id) }, select: { id: true } });
  if (existing) {
    return { ok: false as const, error: "A post with that id already exists." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.feedPost.create({ data: post });
    for (const comment of parsed.data.comments) {
      await tx.feedComment.create({ data: comment as Prisma.FeedCommentUncheckedCreateInput });
    }
    for (const reaction of parsed.data.postReactions) {
      await tx.feedPostReaction.create({ data: reaction as Prisma.FeedPostReactionUncheckedCreateInput });
    }
    for (const reaction of parsed.data.commentReactions) {
      await tx.feedCommentReaction.create({ data: reaction as Prisma.FeedCommentReactionUncheckedCreateInput });
    }
    for (const hashtag of parsed.data.postHashtags) {
      await tx.feedPostHashtag.create({ data: hashtag as Prisma.FeedPostHashtagUncheckedCreateInput });
    }
    for (const hashtag of parsed.data.commentHashtags) {
      await tx.feedCommentHashtag.create({ data: hashtag as Prisma.FeedCommentHashtagUncheckedCreateInput });
    }
  });

  await writeAuditLog({
    actorUserId,
    module: MODULE_KEY,
    action: "stream.thread_imported",
    targetType: "FeedPost",
    targetId: String(post.id),
    severity: "critical",
    metadata: {
      sourceExportedAt: parsed.data.exportedAt,
      commentCount: parsed.data.comments.length
    }
  });

  return { ok: true as const, postId: String(post.id) };
}
