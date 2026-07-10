import {
  GroupMemberRole,
  MediaAssetStatus,
  Prisma,
  SocialRelationshipType,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import {
  notifyGroupForumPostCreated,
  notifyGroupForumPostReaction,
  notifyGroupForumThreadReaction
} from "@/modules/notifications-alerts/notifications-alerts.service";
import {
  createGroupForumPostSchema,
  createGroupForumThreadSchema,
  reactToGroupForumPostSchema,
  reactToGroupForumThreadSchema,
  type GroupForumPostView,
  type GroupForumReactionSummary,
  type GroupForumThreadCardView,
  type GroupForumThreadDetailView
} from "@/modules/group-forum/types";

const MODULE_KEY = "group-forum";
const FORUM_DB_TIMEOUT_MS = 2500;
const DEFAULT_THREAD_PAGE_SIZE = 20;
const MAX_THREAD_PAGE_SIZE = 40;
const DEFAULT_POST_PAGE_SIZE = 40;
const MAX_POST_PAGE_SIZE = 80;

class GroupForumInteractionError extends Error {
  constructor(readonly safeMessage = "Group interaction not found.") {
    super(safeMessage);
  }
}

function withForumDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), FORUM_DB_TIMEOUT_MS);
    })
  ]);
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

function mediaAssetUrl(mediaAsset?: { id: string } | null) {
  return mediaAsset ? `/api/media/assets/${mediaAsset.id}` : null;
}

async function getGroupContext(viewerUserId: string, groupIdOrSlug: string) {
  const [viewer, group] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerUserId },
      select: { role: true, deactivatedAt: true }
    }),
    prisma.group.findFirst({
      where: {
        archivedAt: null,
        OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }]
      },
      select: {
        id: true,
        slug: true,
        name: true,
        members: {
          where: { userId: viewerUserId },
          select: { userId: true, role: true },
          take: 1
        }
      }
    })
  ]);

  if (!group) return null;

  const viewerRole = viewer?.role ?? UserRole.MEMBER;
  const membership = viewer && !viewer.deactivatedAt ? group.members[0] : undefined;
  const canView = Boolean(membership);
  const canPost = Boolean(membership);
  const canModerate =
    Boolean(membership) &&
    (isAdminRole(viewerRole) ||
      membership?.role === GroupMemberRole.OWNER ||
      membership?.role === GroupMemberRole.MODERATOR);

  return {
    group,
    membership,
    viewerRole,
    canView,
    canPost,
    canModerate
  };
}

function boundedPageSize(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(1, Math.trunc(value ?? fallback)));
}

async function blockedUserIdsFor(viewerUserId: string) {
  const relationships = await prisma.socialRelationship.findMany({
    where: {
      type: SocialRelationshipType.BLOCK,
      OR: [{ fromUserId: viewerUserId }, { toUserId: viewerUserId }]
    },
    select: { fromUserId: true, toUserId: true }
  });

  return new Set(
    relationships.map((relationship) =>
      relationship.fromUserId === viewerUserId ? relationship.toUserId : relationship.fromUserId
    )
  );
}

async function requireActiveMembership(
  transaction: Prisma.TransactionClient,
  viewerUserId: string,
  groupId: string
) {
  const [viewer, group, membership] = await Promise.all([
    transaction.user.findUnique({
      where: { id: viewerUserId },
      select: { role: true, deactivatedAt: true }
    }),
    transaction.group.findFirst({
      where: { id: groupId, archivedAt: null },
      select: { id: true }
    }),
    transaction.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: viewerUserId
        }
      },
      select: { role: true }
    })
  ]);

  if (!viewer || viewer.deactivatedAt || !group || !membership) {
    throw new GroupForumInteractionError();
  }

  return {
    role: membership.role,
    canModerate:
      isAdminRole(viewer.role) ||
      membership.role === GroupMemberRole.OWNER ||
      membership.role === GroupMemberRole.MODERATOR
  };
}

function authorView(user: {
  id: string;
  username: string;
  profile: { displayName: string | null; avatarUrl: string | null } | null;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: profileName(user),
    avatarUrl: user.profile?.avatarUrl
  };
}

function toPostView(
  post: Prisma.GroupForumPostGetPayload<{
    include: {
      author: { include: { profile: true } };
      mediaAsset: true;
    };
  }>,
  reactions: GroupForumReactionSummary,
  replyCount: number
): GroupForumPostView {
  return {
    id: post.id,
    body: post.body,
    mediaUrl: mediaAssetUrl(post.mediaAsset),
    parentPostId: post.parentPostId,
    createdAt: post.createdAt.toISOString(),
    author: authorView(post.author),
    reactions,
    replyCount
  };
}

function toThreadCardView(
  viewerUserId: string,
  canModerate: boolean,
  thread: Prisma.GroupForumThreadGetPayload<{
    include: {
      author: { include: { profile: true } };
    };
  }>,
  reactions: GroupForumReactionSummary,
  replyCount: number
): GroupForumThreadCardView {
  return {
    id: thread.id,
    title: thread.title,
    body: thread.body,
    allowPhotoReplies: thread.allowPhotoReplies,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    endedAt: thread.endedAt?.toISOString(),
    deletedAt: thread.deletedAt?.toISOString(),
    pinnedAt: thread.pinnedAt?.toISOString(),
    author: authorView(thread.author),
    reactions,
    replyCount,
    viewerCanEnd: !thread.endedAt && !thread.deletedAt && (thread.authorUserId === viewerUserId || canModerate),
    viewerCanDelete: Boolean(thread.endedAt && !thread.deletedAt && canModerate)
  };
}

export async function listGroupForumThreads(
  viewerUserId: string,
  groupIdOrSlug: string,
  options: { cursor?: string | null; limit?: number } = {}
) {
  const context = await getGroupContext(viewerUserId, groupIdOrSlug);

  if (!context?.canView) {
    return { ok: false as const, error: "Group not found." };
  }

  const blockedUserIds = await blockedUserIdsFor(viewerUserId);
  const limit = boundedPageSize(options.limit, DEFAULT_THREAD_PAGE_SIZE, MAX_THREAD_PAGE_SIZE);
  const threadWhere: Prisma.GroupForumThreadWhereInput = {
    groupId: context.group.id,
    deletedAt: null,
    authorUserId: { notIn: [...blockedUserIds] },
    group: {
      archivedAt: null,
      members: { some: { userId: viewerUserId } }
    }
  };
  const cursorRecord = options.cursor
    ? await prisma.groupForumThread.findFirst({
        where: { ...threadWhere, id: options.cursor },
        select: { id: true }
      })
    : null;

  if (options.cursor && !cursorRecord) {
    return { ok: false as const, error: "Group not found." };
  }

  const threads = await withForumDbTimeout(
    prisma.groupForumThread.findMany({
      where: threadWhere,
      include: {
        author: {
          include: {
            profile: true
          }
        },
        _count: {
          select: {
            posts: {
              where: {
                deletedAt: null,
                authorUserId: { notIn: [...blockedUserIds] }
              }
            }
          }
        }
      },
      orderBy: [{ pinnedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      ...(cursorRecord ? { cursor: { id: cursorRecord.id }, skip: 1 } : {}),
      take: limit + 1
    }),
    "group forum thread lookup"
  );
  const hasMore = threads.length > limit;
  const pageThreads = threads.slice(0, limit);
  const reactionRows = pageThreads.length
    ? await prisma.groupForumThreadReaction.groupBy({
        by: ["threadId", "type"],
        where: {
          threadId: { in: pageThreads.map((thread) => thread.id) },
          userId: { notIn: [...blockedUserIds] }
        },
        _count: { _all: true }
      })
    : [];
  const reactionSummaries = new Map<string, GroupForumReactionSummary>();

  for (const row of reactionRows) {
    const summary = reactionSummaries.get(row.threadId) ?? {};
    summary[row.type] = row._count._all;
    reactionSummaries.set(row.threadId, summary);
  }

  return {
    ok: true as const,
    group: {
      id: context.group.id,
      slug: context.group.slug,
      name: context.group.name
    },
    threads: pageThreads.map((thread) =>
      toThreadCardView(
        viewerUserId,
        context.canModerate,
        thread,
        reactionSummaries.get(thread.id) ?? {},
        thread._count.posts
      )
    ),
    viewerCanPost: context.canPost,
    nextCursor: hasMore ? pageThreads[pageThreads.length - 1]?.id ?? null : null
  };
}

export async function safeListGroupForumThreads(viewerUserId: string, groupIdOrSlug: string) {
  try {
    return await listGroupForumThreads(viewerUserId, groupIdOrSlug);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list group forum threads.", {
      viewerUserId,
      groupIdOrSlug,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load forum." };
  }
}

export async function createGroupForumThread(viewerUserId: string, groupIdOrSlug: string, input: unknown) {
  const parsed = createGroupForumThreadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid thread." };
  }

  const context = await getGroupContext(viewerUserId, groupIdOrSlug);

  if (!context?.canPost) {
    return { ok: false as const, error: "Join the group before posting." };
  }

  let thread;

  try {
    thread = await prisma.$transaction(async (tx) => {
      await requireActiveMembership(tx, viewerUserId, context.group.id);
      return tx.groupForumThread.create({
        data: {
          groupId: context.group.id,
          authorUserId: viewerUserId,
          title: parsed.data.title,
          body: parsed.data.body,
          allowPhotoReplies: parsed.data.allowPhotoReplies
        }
      });
    });
  } catch (error) {
    if (error instanceof GroupForumInteractionError) {
      return { ok: false as const, error: "Join the group before posting." };
    }
    throw error;
  }

  await diagnostics.info(MODULE_KEY, "Group forum thread created.", {
    viewerUserId,
    groupId: context.group.id,
    threadId: thread.id
  });

  return { ok: true as const, thread };
}

export async function getGroupForumThread(
  viewerUserId: string,
  groupIdOrSlug: string,
  threadId: string,
  options: { cursor?: string | null; limit?: number } = {}
) {
  const context = await getGroupContext(viewerUserId, groupIdOrSlug);

  if (!context?.canView) {
    return { ok: false as const, error: "Group not found." };
  }

  const blockedUserIds = await blockedUserIdsFor(viewerUserId);
  const limit = boundedPageSize(options.limit, DEFAULT_POST_PAGE_SIZE, MAX_POST_PAGE_SIZE);

  const thread = await prisma.groupForumThread.findFirst({
    where: {
      id: threadId,
      groupId: context.group.id,
      deletedAt: null,
      authorUserId: { notIn: [...blockedUserIds] },
      group: {
        archivedAt: null,
        members: { some: { userId: viewerUserId } }
      }
    },
    include: {
      author: {
        include: {
          profile: true
        }
      },
      _count: {
        select: {
          posts: {
            where: {
              deletedAt: null,
              authorUserId: { notIn: [...blockedUserIds] }
            }
          }
        }
      }
    }
  });

  if (!thread) {
    return { ok: false as const, error: "Thread not found." };
  }

  const postWhere: Prisma.GroupForumPostWhereInput = {
    threadId: thread.id,
    deletedAt: null,
    authorUserId: { notIn: [...blockedUserIds] },
    thread: {
      group: {
        archivedAt: null,
        members: { some: { userId: viewerUserId } }
      }
    }
  };
  const cursorRecord = options.cursor
    ? await prisma.groupForumPost.findFirst({
        where: { ...postWhere, id: options.cursor },
        select: { id: true }
      })
    : null;

  if (options.cursor && !cursorRecord) {
    return { ok: false as const, error: "Thread not found." };
  }

  const posts = await prisma.groupForumPost.findMany({
    where: postWhere,
    include: {
      author: {
        include: {
          profile: true
        }
      },
      mediaAsset: true,
      _count: {
        select: {
          replies: {
            where: {
              deletedAt: null,
              authorUserId: { notIn: [...blockedUserIds] }
            }
          }
        }
      }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    ...(cursorRecord ? { cursor: { id: cursorRecord.id }, skip: 1 } : {}),
    take: limit + 1
  });
  const hasMore = posts.length > limit;
  const pagePosts = posts.slice(0, limit);
  const [threadReactionRows, postReactionRows] = await Promise.all([
    prisma.groupForumThreadReaction.groupBy({
      by: ["type"],
      where: {
        threadId: thread.id,
        userId: { notIn: [...blockedUserIds] }
      },
      _count: { _all: true }
    }),
    pagePosts.length
      ? prisma.groupForumPostReaction.groupBy({
          by: ["postId", "type"],
          where: {
            postId: { in: pagePosts.map((post) => post.id) },
            userId: { notIn: [...blockedUserIds] }
          },
          _count: { _all: true }
        })
      : Promise.resolve([])
  ]);
  const threadReactions: GroupForumReactionSummary = {};
  for (const row of threadReactionRows) threadReactions[row.type] = row._count._all;
  const postReactions = new Map<string, GroupForumReactionSummary>();
  for (const row of postReactionRows) {
    const summary = postReactions.get(row.postId) ?? {};
    summary[row.type] = row._count._all;
    postReactions.set(row.postId, summary);
  }

  return {
    ok: true as const,
    group: {
      id: context.group.id,
      slug: context.group.slug,
      name: context.group.name
    },
    thread: {
      ...toThreadCardView(viewerUserId, context.canModerate, thread, threadReactions, thread._count.posts),
      posts: pagePosts.map((post) => toPostView(post, postReactions.get(post.id) ?? {}, post._count.replies)),
      viewerRole: context.membership?.role ?? null,
      nextCursor: hasMore ? pagePosts[pagePosts.length - 1]?.id ?? null : null
    } satisfies GroupForumThreadDetailView,
    viewerCanPost: context.canPost && !thread.endedAt && !thread.deletedAt
  };
}

export async function createGroupForumPost(viewerUserId: string, groupIdOrSlug: string, threadId: string, input: unknown) {
  const parsed = createGroupForumPostSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid reply." };
  }

  const context = await getGroupContext(viewerUserId, groupIdOrSlug);

  if (!context?.canPost) {
    return { ok: false as const, error: "Join the group before posting." };
  }

  const blockedUserIds = await blockedUserIdsFor(viewerUserId);

  try {
    const post = await prisma.$transaction(async (tx) => {
      await requireActiveMembership(tx, viewerUserId, context.group.id);
      const thread = await tx.groupForumThread.findFirst({
        where: {
          id: threadId,
          groupId: context.group.id,
          deletedAt: null,
          endedAt: null,
          authorUserId: { notIn: [...blockedUserIds] }
        },
        select: {
          id: true,
          allowPhotoReplies: true
        }
      });

      if (!thread) {
        throw new GroupForumInteractionError("Thread not found or already ended.");
      }

      if (parsed.data.mediaAssetId && !thread.allowPhotoReplies) {
        throw new GroupForumInteractionError("Photo replies are not enabled for this thread.");
      }

      const parent = parsed.data.parentPostId
        ? await tx.groupForumPost.findFirst({
            where: {
              id: parsed.data.parentPostId,
              threadId: thread.id,
              deletedAt: null,
              authorUserId: { notIn: [...blockedUserIds] }
            },
            select: { id: true }
          })
        : null;

      if (parsed.data.parentPostId && !parent) {
        throw new GroupForumInteractionError("Reply target not found.");
      }

      const asset = parsed.data.mediaAssetId
        ? await tx.mediaAsset.findFirst({
            where: {
              id: parsed.data.mediaAssetId,
              ownerUserId: viewerUserId,
              status: MediaAssetStatus.READY,
              groupAssets: {
                some: {
                  groupId: context.group.id,
                  deletedAt: null
                }
              }
            },
            select: { id: true }
          })
        : null;

      if (parsed.data.mediaAssetId && !asset) {
        throw new GroupForumInteractionError("That photo could not be used.");
      }

      const created = await tx.groupForumPost.create({
        data: {
          threadId: thread.id,
          authorUserId: viewerUserId,
          parentPostId: parent?.id ?? null,
          body: parsed.data.body ?? "",
          mediaAssetId: asset?.id ?? null
        }
      });
      const touched = await tx.groupForumThread.updateMany({
        where: {
          id: thread.id,
          groupId: context.group.id,
          endedAt: null,
          deletedAt: null
        },
        data: { updatedAt: created.createdAt }
      });

      if (touched.count !== 1) {
        throw new GroupForumInteractionError("Thread not found or already ended.");
      }

      const notification = await notifyGroupForumPostCreated(viewerUserId, created.id, tx);
      if (!notification.ok) {
        throw new GroupForumInteractionError("Could not create the group reply.");
      }

      return created;
    });

    return { ok: true as const, post };
  } catch (error) {
    if (error instanceof GroupForumInteractionError) {
      return { ok: false as const, error: error.safeMessage };
    }
    throw error;
  }
}

export async function endGroupForumThread(viewerUserId: string, groupIdOrSlug: string, threadId: string) {
  const context = await getGroupContext(viewerUserId, groupIdOrSlug);
  if (!context?.canPost) return { ok: false as const, error: "Group not found." };

  try {
    await prisma.$transaction(async (tx) => {
      const membership = await requireActiveMembership(tx, viewerUserId, context.group.id);
      const thread = await tx.groupForumThread.findFirst({
        where: {
          id: threadId,
          groupId: context.group.id,
          endedAt: null,
          deletedAt: null
        },
        select: { id: true, authorUserId: true }
      });

      if (!thread || (thread.authorUserId !== viewerUserId && !membership.canModerate)) {
        throw new GroupForumInteractionError("You cannot end this thread.");
      }

      const ended = await tx.groupForumThread.updateMany({
        where: {
          id: thread.id,
          groupId: context.group.id,
          endedAt: null,
          deletedAt: null
        },
        data: {
          endedAt: new Date(),
          endedByUserId: viewerUserId
        }
      });

      if (ended.count !== 1) throw new GroupForumInteractionError("You cannot end this thread.");
    });
    return { ok: true as const };
  } catch (error) {
    if (error instanceof GroupForumInteractionError) {
      return { ok: false as const, error: error.safeMessage };
    }
    throw error;
  }
}

export async function deleteEndedGroupForumThread(viewerUserId: string, groupIdOrSlug: string, threadId: string) {
  const context = await getGroupContext(viewerUserId, groupIdOrSlug);
  if (!context?.canPost) return { ok: false as const, error: "Group not found." };

  try {
    await prisma.$transaction(async (tx) => {
      const membership = await requireActiveMembership(tx, viewerUserId, context.group.id);
      if (!membership.canModerate) {
        throw new GroupForumInteractionError("Only moderators can delete an ended thread.");
      }

      const deleted = await tx.groupForumThread.updateMany({
        where: {
          id: threadId,
          groupId: context.group.id,
          endedAt: { not: null },
          deletedAt: null
        },
        data: {
          deletedAt: new Date(),
          deletedByUserId: viewerUserId
        }
      });

      if (deleted.count !== 1) {
        throw new GroupForumInteractionError("Only moderators can delete an ended thread.");
      }
    });
    return { ok: true as const };
  } catch (error) {
    if (error instanceof GroupForumInteractionError) {
      return { ok: false as const, error: error.safeMessage };
    }
    throw error;
  }
}

export async function reactToGroupForumThread(viewerUserId: string, groupIdOrSlug: string, threadId: string, input: unknown) {
  const parsed = reactToGroupForumThreadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid reaction." };
  }

  const context = await getGroupContext(viewerUserId, groupIdOrSlug);
  if (!context?.canPost) return { ok: false as const, error: "Group not found." };
  const blockedUserIds = await blockedUserIdsFor(viewerUserId);

  try {
    await prisma.$transaction(async (tx) => {
      await requireActiveMembership(tx, viewerUserId, context.group.id);
      const thread = await tx.groupForumThread.findFirst({
        where: {
          id: threadId,
          groupId: context.group.id,
          endedAt: null,
          deletedAt: null,
          authorUserId: { notIn: [...blockedUserIds] }
        },
        select: { id: true }
      });
      if (!thread) throw new GroupForumInteractionError("Thread not found.");

      await tx.groupForumThreadReaction.upsert({
        where: {
          threadId_userId: {
            threadId: thread.id,
            userId: viewerUserId
          }
        },
        update: { type: parsed.data.type },
        create: {
          threadId: thread.id,
          userId: viewerUserId,
          type: parsed.data.type
        }
      });
      const notification = await notifyGroupForumThreadReaction(viewerUserId, thread.id, tx);
      if (!notification.ok) throw new GroupForumInteractionError("Could not save the reaction.");
    });
    return { ok: true as const };
  } catch (error) {
    if (error instanceof GroupForumInteractionError) {
      return { ok: false as const, error: error.safeMessage };
    }
    throw error;
  }
}

export async function reactToGroupForumPost(viewerUserId: string, groupIdOrSlug: string, postId: string, input: unknown) {
  const parsed = reactToGroupForumPostSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid reaction." };
  }

  const context = await getGroupContext(viewerUserId, groupIdOrSlug);
  if (!context?.canPost) return { ok: false as const, error: "Group not found." };
  const blockedUserIds = await blockedUserIdsFor(viewerUserId);

  try {
    await prisma.$transaction(async (tx) => {
      await requireActiveMembership(tx, viewerUserId, context.group.id);
      const post = await tx.groupForumPost.findFirst({
        where: {
          id: postId,
          deletedAt: null,
          authorUserId: { notIn: [...blockedUserIds] },
          thread: {
            groupId: context.group.id,
            endedAt: null,
            deletedAt: null,
            authorUserId: { notIn: [...blockedUserIds] }
          }
        },
        select: { id: true }
      });
      if (!post) throw new GroupForumInteractionError("Post not found.");

      await tx.groupForumPostReaction.upsert({
        where: {
          postId_userId: {
            postId: post.id,
            userId: viewerUserId
          }
        },
        update: { type: parsed.data.type },
        create: {
          postId: post.id,
          userId: viewerUserId,
          type: parsed.data.type
        }
      });
      const notification = await notifyGroupForumPostReaction(viewerUserId, post.id, tx);
      if (!notification.ok) throw new GroupForumInteractionError("Could not save the reaction.");
    });
    return { ok: true as const };
  } catch (error) {
    if (error instanceof GroupForumInteractionError) {
      return { ok: false as const, error: error.safeMessage };
    }
    throw error;
  }
}
