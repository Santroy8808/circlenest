import {
  GroupForumReactionType,
  GroupMemberRole,
  GroupVisibility,
  Prisma,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import {
  createGroupForumPostSchema,
  createGroupForumThreadSchema,
  reactToGroupForumPostSchema,
  reactToGroupForumThreadSchema,
  type GroupForumPostView,
  type GroupForumThreadCardView,
  type GroupForumThreadDetailView
} from "@/modules/group-forum/types";

const MODULE_KEY = "group-forum";
const FORUM_DB_TIMEOUT_MS = 2500;

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

function countReactions<T extends { type: GroupForumReactionType }>(reactions: T[]) {
  return reactions.reduce<Partial<Record<GroupForumReactionType, number>>>((acc, reaction) => {
    acc[reaction.type] = (acc[reaction.type] ?? 0) + 1;
    return acc;
  }, {});
}

async function getGroupContext(viewerUserId: string, groupIdOrSlug: string) {
  const [viewer, group] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerUserId },
      select: { role: true }
    }),
    prisma.group.findFirst({
      where: {
        archivedAt: null,
        OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }]
      },
      include: {
        members: true
      }
    })
  ]);

  if (!group) return null;

  const viewerRole = viewer?.role ?? UserRole.MEMBER;
  const membership = group.members.find((member) => member.userId === viewerUserId);
  const canView = group.visibility === GroupVisibility.PUBLIC || isAdminRole(viewerRole) || Boolean(membership);
  const canPost = Boolean(membership);
  const canModerate =
    isAdminRole(viewerRole) ||
    membership?.role === GroupMemberRole.OWNER ||
    membership?.role === GroupMemberRole.MODERATOR;

  return {
    group,
    membership,
    viewerRole,
    canView,
    canPost,
    canModerate
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
      reactions: true;
      replies: { select: { id: true } };
    };
  }>
): GroupForumPostView {
  return {
    id: post.id,
    body: post.body,
    mediaUrl: post.mediaAsset?.publicUrl,
    parentPostId: post.parentPostId,
    createdAt: post.createdAt.toISOString(),
    author: authorView(post.author),
    reactions: countReactions(post.reactions),
    replyCount: post.replies.length
  };
}

function toThreadCardView(
  viewerUserId: string,
  canModerate: boolean,
  thread: Prisma.GroupForumThreadGetPayload<{
    include: {
      author: { include: { profile: true } };
      reactions: true;
      posts: { select: { id: true } };
    };
  }>
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
    reactions: countReactions(thread.reactions),
    replyCount: thread.posts.length,
    viewerCanEnd: !thread.endedAt && !thread.deletedAt && (thread.authorUserId === viewerUserId || canModerate),
    viewerCanDelete: Boolean(thread.endedAt && !thread.deletedAt && canModerate)
  };
}

export async function listGroupForumThreads(viewerUserId: string, groupIdOrSlug: string) {
  const context = await getGroupContext(viewerUserId, groupIdOrSlug);

  if (!context?.canView) {
    return { ok: false as const, error: "Group not found." };
  }

  const threads = await withForumDbTimeout(
    prisma.groupForumThread.findMany({
      where: {
        groupId: context.group.id,
        deletedAt: null
      },
      include: {
        author: {
          include: {
            profile: true
          }
        },
        reactions: true,
        posts: {
          where: { deletedAt: null },
          select: { id: true }
        }
      },
      orderBy: [{ pinnedAt: "desc" }, { updatedAt: "desc" }],
      take: 40
    }),
    "group forum thread lookup"
  );

  return {
    ok: true as const,
    group: {
      id: context.group.id,
      slug: context.group.slug,
      name: context.group.name
    },
    threads: threads.map((thread) => toThreadCardView(viewerUserId, context.canModerate, thread)),
    viewerCanPost: context.canPost
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

  const thread = await prisma.groupForumThread.create({
    data: {
      groupId: context.group.id,
      authorUserId: viewerUserId,
      title: parsed.data.title,
      body: parsed.data.body,
      allowPhotoReplies: parsed.data.allowPhotoReplies
    }
  });

  await diagnostics.info(MODULE_KEY, "Group forum thread created.", {
    viewerUserId,
    groupId: context.group.id,
    threadId: thread.id
  });

  return { ok: true as const, thread };
}

export async function getGroupForumThread(viewerUserId: string, groupIdOrSlug: string, threadId: string) {
  const context = await getGroupContext(viewerUserId, groupIdOrSlug);

  if (!context?.canView) {
    return { ok: false as const, error: "Group not found." };
  }

  const thread = await prisma.groupForumThread.findFirst({
    where: {
      id: threadId,
      groupId: context.group.id,
      OR: [{ deletedAt: null }, ...(context.canModerate ? [{}] : [])]
    },
    include: {
      author: {
        include: {
          profile: true
        }
      },
      reactions: true,
      posts: {
        where: { deletedAt: null },
        include: {
          author: {
            include: {
              profile: true
            }
          },
          mediaAsset: true,
          reactions: true,
          replies: {
            where: { deletedAt: null },
            select: { id: true }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!thread) {
    return { ok: false as const, error: "Thread not found." };
  }

  return {
    ok: true as const,
    group: {
      id: context.group.id,
      slug: context.group.slug,
      name: context.group.name
    },
    thread: {
      ...toThreadCardView(viewerUserId, context.canModerate, thread),
      posts: thread.posts.map(toPostView),
      viewerRole: context.membership?.role ?? null
    } satisfies GroupForumThreadDetailView,
    viewerCanPost: context.canPost && !thread.endedAt && !thread.deletedAt
  };
}

export async function createGroupForumPost(viewerUserId: string, groupIdOrSlug: string, threadId: string, input: unknown) {
  const parsed = createGroupForumPostSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid reply." };
  }

  const detail = await getGroupForumThread(viewerUserId, groupIdOrSlug, threadId);

  if (!detail.ok) {
    return detail;
  }

  if (!detail.viewerCanPost) {
    return { ok: false as const, error: "This thread is ended." };
  }

  if (parsed.data.mediaAssetId && !detail.thread.allowPhotoReplies) {
    return { ok: false as const, error: "Photo replies are not enabled for this thread." };
  }

  if (parsed.data.mediaAssetId) {
    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: parsed.data.mediaAssetId,
        ownerUserId: viewerUserId,
        groupAssets: {
          some: {
            groupId: detail.group.id,
            deletedAt: null
          }
        }
      },
      select: { id: true }
    });

    if (!asset) {
      return { ok: false as const, error: "That photo could not be used." };
    }
  }

  const post = await prisma.groupForumPost.create({
    data: {
      threadId,
      authorUserId: viewerUserId,
      parentPostId: parsed.data.parentPostId || null,
      body: parsed.data.body?.trim() ?? "",
      mediaAssetId: parsed.data.mediaAssetId || null
    }
  });

  await prisma.groupForumThread.update({
    where: { id: threadId },
    data: { updatedAt: post.createdAt }
  });

  return { ok: true as const, post };
}

export async function endGroupForumThread(viewerUserId: string, groupIdOrSlug: string, threadId: string) {
  const detail = await getGroupForumThread(viewerUserId, groupIdOrSlug, threadId);

  if (!detail.ok) {
    return detail;
  }

  if (!detail.thread.viewerCanEnd) {
    return { ok: false as const, error: "You cannot end this thread." };
  }

  await prisma.groupForumThread.update({
    where: { id: threadId },
    data: {
      endedAt: new Date(),
      endedByUserId: viewerUserId
    }
  });

  return { ok: true as const };
}

export async function deleteEndedGroupForumThread(viewerUserId: string, groupIdOrSlug: string, threadId: string) {
  const detail = await getGroupForumThread(viewerUserId, groupIdOrSlug, threadId);

  if (!detail.ok) {
    return detail;
  }

  if (!detail.thread.viewerCanDelete) {
    return { ok: false as const, error: "Only moderators can delete an ended thread." };
  }

  await prisma.groupForumThread.update({
    where: { id: threadId },
    data: {
      deletedAt: new Date(),
      deletedByUserId: viewerUserId
    }
  });

  return { ok: true as const };
}

export async function reactToGroupForumThread(viewerUserId: string, groupIdOrSlug: string, threadId: string, input: unknown) {
  const parsed = reactToGroupForumThreadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid reaction." };
  }

  const detail = await getGroupForumThread(viewerUserId, groupIdOrSlug, threadId);

  if (!detail.ok) {
    return detail;
  }

  await prisma.groupForumThreadReaction.upsert({
    where: {
      threadId_userId: {
        threadId,
        userId: viewerUserId
      }
    },
    update: { type: parsed.data.type },
    create: {
      threadId,
      userId: viewerUserId,
      type: parsed.data.type
    }
  });

  return { ok: true as const };
}

export async function reactToGroupForumPost(viewerUserId: string, groupIdOrSlug: string, postId: string, input: unknown) {
  const parsed = reactToGroupForumPostSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid reaction." };
  }

  const post = await prisma.groupForumPost.findUnique({
    where: { id: postId },
    select: {
      threadId: true,
      thread: {
        select: {
          groupId: true,
          group: {
            select: {
              id: true,
              slug: true
            }
          }
        }
      }
    }
  });

  if (!post) {
    return { ok: false as const, error: "Post not found." };
  }

  const detail = await getGroupForumThread(viewerUserId, groupIdOrSlug, post.threadId);

  if (!detail.ok) {
    return detail;
  }

  await prisma.groupForumPostReaction.upsert({
    where: {
      postId_userId: {
        postId,
        userId: viewerUserId
      }
    },
    update: { type: parsed.data.type },
    create: {
      postId,
      userId: viewerUserId,
      type: parsed.data.type
    }
  });

  return { ok: true as const };
}
