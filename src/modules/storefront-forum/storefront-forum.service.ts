import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { getBusinessAccountForOwner } from "@/modules/business-accounts/business-accounts.service";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  createStorefrontForumPostSchema,
  createStorefrontForumTopicSchema,
  listStorefrontForumTopicsSchema,
  type StorefrontForumAuthorView,
  type StorefrontForumPostView,
  type StorefrontForumTopicDetailView,
  type StorefrontForumTopicListItemView,
  type StorefrontForumView
} from "@/modules/storefront-forum/types";

const MODULE_KEY = "storefront-forum";
const DEFAULT_TOPIC_LIMIT = 40;

type ForumAuthorPayload = {
  author: {
    id: string;
    username: string;
    profile: { displayName: string | null; avatarUrl: string | null } | null;
  } | null;
  guestName: string | null;
};

type ForumTopicPayload = Prisma.StorefrontForumTopicGetPayload<{
  include: {
    author: { include: { profile: true } };
    _count: { select: { posts: true } };
  };
}>;

type ForumPostPayload = Prisma.StorefrontForumPostGetPayload<{
  include: {
    author: { include: { profile: true } };
    replies: {
      include: {
        author: { include: { profile: true } };
        _count: { select: { replies: true } };
      };
    };
    _count: { select: { replies: true } };
  };
}>;

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

function topicPublicUrl(profileSlug: string, topicId: string) {
  return `/storefront/${profileSlug}/forum/${topicId}`;
}

function bodyPreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function authorView(input: ForumAuthorPayload): StorefrontForumAuthorView {
  if (input.author) {
    return {
      id: input.author.id,
      username: input.author.username,
      displayName: profileName(input.author),
      avatarUrl: input.author.profile?.avatarUrl ?? null,
      isGuest: false
    };
  }

  return {
    id: null,
    username: null,
    displayName: input.guestName?.trim() || "Guest",
    avatarUrl: null,
    isGuest: true
  };
}

function toTopicListItem(
  profileSlug: string,
  topic: ForumTopicPayload,
  viewerCanManage: boolean
): StorefrontForumTopicListItemView {
  return {
    id: topic.id,
    title: topic.title,
    bodyPreview: bodyPreview(topic.body),
    imageUrl: topic.imageUrl,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
    lastPostAt: topic.lastPostAt.toISOString(),
    author: authorView(topic),
    replyCount: topic._count.posts,
    viewerCanDelete: viewerCanManage,
    publicUrl: topicPublicUrl(profileSlug, topic.id)
  };
}

function toPostView(post: ForumPostPayload, viewerCanManage: boolean): StorefrontForumPostView {
  return {
    id: post.id,
    body: post.body,
    imageUrl: post.imageUrl,
    parentPostId: post.parentPostId,
    createdAt: post.createdAt.toISOString(),
    author: authorView(post),
    replyCount: post.replies?.length ?? post._count.replies,
    replies: post.replies?.map((reply) => ({
      id: reply.id,
      body: reply.body,
      imageUrl: reply.imageUrl,
      parentPostId: reply.parentPostId,
      createdAt: reply.createdAt.toISOString(),
      author: authorView(reply),
      replyCount: reply._count.replies,
      viewerCanDelete: viewerCanManage
    })),
    viewerCanDelete: viewerCanManage
  };
}

async function getForumProfile(slug: string) {
  return prisma.businessProfile.findFirst({
    where: {
      slug,
      publicStorefrontEnabled: true,
      forumEnabled: true
    },
    select: {
      id: true,
      ownerUserId: true,
      slug: true,
      businessName: true,
      bannerUrl: true,
      forumEnabled: true,
      forumAllowPictureUploads: true
    }
  });
}

export function storefrontManagementRelationshipAllows(input: {
  viewerUserId: string;
  ownerUserId: string;
  linkedBusinessUserId?: string | null;
  viewerActive: boolean;
  capabilityAllowed: boolean;
}) {
  return Boolean(
    input.viewerActive &&
      input.capabilityAllowed &&
      (input.viewerUserId === input.ownerUserId || input.linkedBusinessUserId === input.ownerUserId)
  );
}

async function canManageStorefrontProfile(viewerUserId: string | null | undefined, ownerUserId: string) {
  if (!viewerUserId) return false;

  const [viewer, linkedAccount, access] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerUserId },
      select: { deactivatedAt: true }
    }),
    getBusinessAccountForOwner(viewerUserId),
    canUserAccessFeature(viewerUserId, "market.storefront")
  ]);

  return storefrontManagementRelationshipAllows({
    viewerUserId,
    ownerUserId,
    linkedBusinessUserId: linkedAccount?.businessUserId,
    viewerActive: Boolean(viewer && !viewer.deactivatedAt),
    capabilityAllowed: access.allowed
  });
}

function requireGuestName(viewerUserId: string | null | undefined, guestName: string | undefined) {
  if (viewerUserId) return null;

  const trimmedName = guestName?.trim() ?? "";
  if (trimmedName.length < 2) return "Add your name before posting.";
  return trimmedName;
}

function normalizeImageUrl(imageUrl: string | undefined, allowImages: boolean) {
  const trimmedUrl = imageUrl?.trim() ?? "";
  if (!trimmedUrl) return { ok: true as const, imageUrl: null };
  if (!allowImages) return { ok: false as const, error: "This storefront forum does not allow picture attachments." };
  return { ok: true as const, imageUrl: trimmedUrl };
}

export async function listStorefrontForumTopics(
  slug: string,
  options: { query?: string | null; viewerUserId?: string | null; limit?: number } = {}
): Promise<{ ok: true; forum: StorefrontForumView } | { ok: false; error: string }> {
  const parsed = listStorefrontForumTopicsSchema.safeParse({ query: options.query ?? "" });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid forum search." };
  }

  const profile = await getForumProfile(slug);
  if (!profile) return { ok: false, error: "Storefront forum not found." };

  const viewerCanManage = await canManageStorefrontProfile(options.viewerUserId, profile.ownerUserId);
  const query = parsed.data.query?.trim() ?? "";
  const topics = await prisma.storefrontForumTopic.findMany({
    where: {
      businessProfileId: profile.id,
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { body: { contains: query, mode: "insensitive" } },
              { guestName: { contains: query, mode: "insensitive" } }
            ]
          }
        : {})
    },
    include: {
      author: { include: { profile: true } },
      _count: { select: { posts: true } }
    },
    orderBy: [{ lastPostAt: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(options.limit ?? DEFAULT_TOPIC_LIMIT, 80))
  });

  return {
    ok: true,
    forum: {
      profile: {
        id: profile.id,
        slug: profile.slug,
        businessName: profile.businessName,
        bannerUrl: profile.bannerUrl,
        forumEnabled: profile.forumEnabled,
        forumAllowPictureUploads: profile.forumAllowPictureUploads
      },
      topics: topics.map((topic) => toTopicListItem(profile.slug, topic, viewerCanManage)),
      viewerCanManage
    }
  };
}

export async function getStorefrontForumTopic(
  slug: string,
  topicId: string,
  viewerUserId?: string | null
): Promise<
  | {
      ok: true;
      profile: StorefrontForumView["profile"];
      topic: StorefrontForumTopicDetailView;
      viewerCanManage: boolean;
    }
  | { ok: false; error: string }
> {
  const topic = await prisma.storefrontForumTopic.findFirst({
    where: {
      id: topicId,
      deletedAt: null,
      businessProfile: {
        slug,
        publicStorefrontEnabled: true,
        forumEnabled: true
      }
    },
    include: {
      businessProfile: {
        select: {
          id: true,
          ownerUserId: true,
          slug: true,
          businessName: true,
          bannerUrl: true,
          forumEnabled: true,
          forumAllowPictureUploads: true
        }
      },
      author: { include: { profile: true } },
      posts: {
        where: {
          deletedAt: null,
          parentPostId: null
        },
        include: {
          author: { include: { profile: true } },
          replies: {
            where: {
              deletedAt: null
            },
            include: {
              author: { include: { profile: true } },
              _count: { select: { replies: true } }
            },
            orderBy: {
              createdAt: "asc"
            }
          },
          _count: { select: { replies: true } }
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      _count: { select: { posts: true } }
    }
  });

  if (!topic) return { ok: false, error: "Forum topic not found." };

  const viewerCanManage = await canManageStorefrontProfile(viewerUserId, topic.businessProfile.ownerUserId);
  const topicListItem = toTopicListItem(topic.businessProfile.slug, topic, viewerCanManage);

  return {
    ok: true,
    profile: {
      id: topic.businessProfile.id,
      slug: topic.businessProfile.slug,
      businessName: topic.businessProfile.businessName,
      bannerUrl: topic.businessProfile.bannerUrl,
      forumEnabled: topic.businessProfile.forumEnabled,
      forumAllowPictureUploads: topic.businessProfile.forumAllowPictureUploads
    },
    topic: {
      ...topicListItem,
      body: topic.body,
      posts: topic.posts.map((post) => toPostView(post, viewerCanManage)),
      forumAllowPictureUploads: topic.businessProfile.forumAllowPictureUploads
    },
    viewerCanManage
  };
}

export async function createStorefrontForumTopic(slug: string, viewerUserId: string | null | undefined, input: unknown) {
  const parsed = createStorefrontForumTopicSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid forum topic." };
  }

  const profile = await getForumProfile(slug);
  if (!profile) return { ok: false as const, error: "Storefront forum not found." };

  const guestName = requireGuestName(viewerUserId, parsed.data.guestName);
  if (guestName === "Add your name before posting.") return { ok: false as const, error: guestName };

  const image = normalizeImageUrl(parsed.data.imageUrl, profile.forumAllowPictureUploads);
  if (!image.ok) return image;

  const topic = await prisma.storefrontForumTopic.create({
    data: {
      businessProfileId: profile.id,
      authorUserId: viewerUserId ?? null,
      guestName,
      title: parsed.data.title,
      body: parsed.data.body,
      imageUrl: image.imageUrl
    },
    include: {
      author: { include: { profile: true } },
      _count: { select: { posts: true } }
    }
  });

  await diagnostics.info(MODULE_KEY, "Storefront forum topic created.", {
    businessProfileId: profile.id,
    topicId: topic.id,
    authorUserId: viewerUserId ?? null
  });

  return { ok: true as const, topic: toTopicListItem(profile.slug, topic, false) };
}

export async function createStorefrontForumPost(
  slug: string,
  topicId: string,
  viewerUserId: string | null | undefined,
  input: unknown
) {
  const parsed = createStorefrontForumPostSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid forum reply." };
  }

  const topic = await prisma.storefrontForumTopic.findFirst({
    where: {
      id: topicId,
      deletedAt: null,
      businessProfile: {
        slug,
        publicStorefrontEnabled: true,
        forumEnabled: true
      }
    },
    include: {
      businessProfile: {
        select: {
          id: true,
          slug: true,
          forumAllowPictureUploads: true
        }
      }
    }
  });

  if (!topic) return { ok: false as const, error: "Forum topic not found." };

  const guestName = requireGuestName(viewerUserId, parsed.data.guestName);
  if (guestName === "Add your name before posting.") return { ok: false as const, error: guestName };

  const image = normalizeImageUrl(parsed.data.imageUrl, topic.businessProfile.forumAllowPictureUploads);
  if (!image.ok) return image;

  const parentPostIdInput = parsed.data.parentPostId?.trim() || null;
  let parentPostId: string | null = null;

  if (parentPostIdInput) {
    const parent = await prisma.storefrontForumPost.findFirst({
      where: {
        id: parentPostIdInput,
        topicId: topic.id,
        deletedAt: null
      },
      select: {
        id: true,
        parentPostId: true
      }
    });

    if (!parent) return { ok: false as const, error: "Reply target was not found." };
    parentPostId = parent.parentPostId ?? parent.id;
  }

  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.storefrontForumPost.create({
      data: {
        topicId: topic.id,
        authorUserId: viewerUserId ?? null,
        guestName,
        parentPostId,
        body: parsed.data.body?.trim() ?? "",
        imageUrl: image.imageUrl
      },
      include: {
        author: { include: { profile: true } },
        replies: {
          include: {
            author: { include: { profile: true } },
            _count: { select: { replies: true } }
          }
        },
        _count: { select: { replies: true } }
      }
    });

    await tx.storefrontForumTopic.update({
      where: { id: topic.id },
      data: { lastPostAt: created.createdAt }
    });

    return created;
  });

  return { ok: true as const, post: toPostView(post, false) };
}

export async function deleteStorefrontForumTopic(slug: string, topicId: string, viewerUserId: string) {
  const topic = await prisma.storefrontForumTopic.findFirst({
    where: {
      id: topicId,
      deletedAt: null,
      businessProfile: {
        slug,
        publicStorefrontEnabled: true,
        forumEnabled: true
      }
    },
    include: {
      businessProfile: {
        select: {
          ownerUserId: true
        }
      }
    }
  });

  if (!topic) return { ok: false as const, error: "Forum topic not found." };

  const canManage = await canManageStorefrontProfile(viewerUserId, topic.businessProfile.ownerUserId);
  if (!canManage) return { ok: false as const, error: "Business forum management access required." };

  await prisma.storefrontForumTopic.update({
    where: { id: topic.id },
    data: {
      deletedAt: new Date(),
      deletedByUserId: viewerUserId
    }
  });

  return { ok: true as const };
}

export async function deleteStorefrontForumPost(slug: string, postId: string, viewerUserId: string) {
  const post = await prisma.storefrontForumPost.findFirst({
    where: {
      id: postId,
      deletedAt: null,
      topic: {
        deletedAt: null,
        businessProfile: {
          slug,
          publicStorefrontEnabled: true,
          forumEnabled: true
        }
      }
    },
    include: {
      topic: {
        include: {
          businessProfile: {
            select: {
              ownerUserId: true
            }
          }
        }
      }
    }
  });

  if (!post) return { ok: false as const, error: "Forum reply not found." };

  const canManage = await canManageStorefrontProfile(viewerUserId, post.topic.businessProfile.ownerUserId);
  if (!canManage) return { ok: false as const, error: "Business forum management access required." };

  await prisma.storefrontForumPost.update({
    where: { id: post.id },
    data: {
      deletedAt: new Date(),
      deletedByUserId: viewerUserId
    }
  });

  return { ok: true as const };
}

export async function safeListStorefrontForumTopics(
  slug: string,
  options: { query?: string | null; viewerUserId?: string | null; limit?: number } = {}
) {
  try {
    return await listStorefrontForumTopics(slug, options);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load storefront forum topics.", {
      slug,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load storefront forum." };
  }
}

export async function safeGetStorefrontForumTopic(slug: string, topicId: string, viewerUserId?: string | null) {
  try {
    return await getStorefrontForumTopic(slug, topicId, viewerUserId);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load storefront forum topic.", {
      slug,
      topicId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load forum topic." };
  }
}
