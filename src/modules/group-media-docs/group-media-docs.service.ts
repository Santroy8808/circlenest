import { randomBytes } from "crypto";
import { GroupAssetKind, GroupMemberRole, GroupVisibility, MediaVisibility, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import { verifyPassword } from "@/modules/auth-security/password";
import { createPresignedR2PutUrl, deleteR2Object, getR2PublicUrl, verifyR2Object } from "@/lib/platform/r2";
import {
  completeGroupAssetUploadSchema,
  createGroupAssetCommentSchema,
  createGroupAssetUploadIntentSchema,
  groupAssetKindSchema,
  purgeGroupStorageSchema,
  updateGroupStorageLimitSchema,
  type GroupAssetCommentView,
  type GroupAssetView
} from "@/modules/group-media-docs/types";

const MODULE_KEY = "group-media-docs";
const GROUP_MEDIA_DB_TIMEOUT_MS = 2500;

function withGroupMediaDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), GROUP_MEDIA_DB_TIMEOUT_MS);
    })
  ]);
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
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

function safeFileName(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return cleaned || "group-asset";
}

function dateSlug(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function mediaAssetUrl(mediaAsset?: { id: string; publicUrl: string | null } | null) {
  return mediaAsset ? mediaAsset.publicUrl ?? `/api/media/assets/${mediaAsset.id}` : null;
}

export async function getGroupMediaContext(viewerUserId: string, groupIdOrSlug: string) {
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
  const canModerate =
    isAdminRole(viewerRole) ||
    membership?.role === GroupMemberRole.OWNER ||
    membership?.role === GroupMemberRole.MODERATOR;
  const canUpload = canModerate || Boolean(membership?.isProvider);
  const canComment = isAdminRole(viewerRole) || Boolean(membership);

  return {
    group,
    membership,
    viewerRole,
    canView,
    canModerate,
    canUpload,
    canComment
  };
}

export async function currentGroupStorageBytes(groupId: string) {
  const assets = await prisma.groupAsset.findMany({
    where: {
      groupId,
      deletedAt: null
    },
    select: {
      mediaAsset: {
        select: {
          sizeBytes: true
        }
      }
    }
  });

  return assets.reduce((total, asset) => total + asset.mediaAsset.sizeBytes, BigInt(0));
}

function canManageGroupStorage(context: NonNullable<Awaited<ReturnType<typeof getGroupMediaContext>>>, viewerUserId: string) {
  return context.canModerate || context.group.createdByUserId === viewerUserId;
}

async function hardDeleteGroupAssets(groupAssetIds: string[]) {
  if (groupAssetIds.length === 0) return { deletedCount: 0, freedBytes: BigInt(0) };

  const assets = await prisma.groupAsset.findMany({
    where: {
      id: { in: groupAssetIds }
    },
    select: {
      mediaAssetId: true,
      mediaAsset: {
        select: {
          storageKey: true,
          sizeBytes: true,
          metadata: true
        }
      }
    }
  });
  const mediaAssetIds = assets.map((asset) => asset.mediaAssetId);
  const freedBytes = assets.reduce((total, asset) => total + asset.mediaAsset.sizeBytes, BigInt(0));

  await prisma.mediaAsset.deleteMany({
    where: {
      id: { in: mediaAssetIds }
    }
  });

  await Promise.all(
    assets.map(async (asset) => {
      const metadata = asset.mediaAsset.metadata as { thumbnailStorageKey?: string | null } | null;
      const storageKeys = [asset.mediaAsset.storageKey, metadata?.thumbnailStorageKey].filter((key): key is string => Boolean(key));
      await Promise.all(storageKeys.map((storageKey) => deleteR2Object(storageKey).catch(() => null)));
    })
  );

  return { deletedCount: assets.length, freedBytes };
}

export async function canUploadGroupAsset(input: {
  groupId: string;
  canUpload: boolean;
  isGroupMember: boolean;
  forumThreadId?: string | null;
}) {
  if (input.canUpload) return true;
  if (!input.isGroupMember || !input.forumThreadId) return false;

  const thread = await prisma.groupForumThread.findFirst({
    where: {
      id: input.forumThreadId,
      groupId: input.groupId,
      allowPhotoReplies: true,
      endedAt: null,
      deletedAt: null
    },
    select: { id: true }
  });

  return Boolean(thread);
}

function toCommentView(comment: Prisma.GroupAssetCommentGetPayload<{ include: { author: { include: { profile: true } } } }>): GroupAssetCommentView {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: authorView(comment.author)
  };
}

function toAssetView(
  viewerUserId: string,
  canModerate: boolean,
  asset: Prisma.GroupAssetGetPayload<{
    include: {
      mediaAsset: true;
      uploader: { include: { profile: true } };
      comments: { include: { author: { include: { profile: true } } } };
      _count: { select: { comments: true } };
    };
  }>
): GroupAssetView {
  return {
    id: asset.id,
    kind: asset.kind,
    headline: asset.headline,
    description: asset.description,
    publicUrl: mediaAssetUrl(asset.mediaAsset),
    originalName: asset.mediaAsset.originalName,
    mimeType: asset.mediaAsset.mimeType,
    sizeBytes: asset.mediaAsset.sizeBytes.toString(),
    createdAt: asset.createdAt.toISOString(),
    uploader: authorView(asset.uploader),
    comments: asset.comments.map(toCommentView),
    commentCount: asset._count.comments,
    viewerCanDelete: canModerate || asset.uploaderUserId === viewerUserId
  };
}

export async function listGroupAssets(viewerUserId: string, groupIdOrSlug: string, requestedKind?: string | null) {
  const context = await getGroupMediaContext(viewerUserId, groupIdOrSlug);

  if (!context?.canView) {
    return { ok: false as const, error: "Group not found." };
  }

  const parsedKind = requestedKind ? groupAssetKindSchema.safeParse(requestedKind) : null;
  const kind = parsedKind?.success ? parsedKind.data : undefined;
  const [storageUsedBytes, assets] = await Promise.all([
    currentGroupStorageBytes(context.group.id),
    withGroupMediaDbTimeout(
      prisma.groupAsset.findMany({
        where: {
          groupId: context.group.id,
          deletedAt: null,
          ...(kind ? { kind } : {})
        },
        include: {
          mediaAsset: true,
          uploader: {
            include: {
              profile: true
            }
          },
          comments: {
            where: {
              deletedAt: null
            },
            include: {
              author: {
                include: {
                  profile: true
                }
              }
            },
            orderBy: {
              createdAt: "asc"
            },
            take: 4
          },
          _count: {
            select: {
              comments: true
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 80
      }),
      "group media lookup"
    )
  ]);

  return {
    ok: true as const,
    group: {
      id: context.group.id,
      slug: context.group.slug,
      name: context.group.name,
      storageLimitBytes: context.group.storageLimitBytes.toString()
    },
    assets: assets.map((asset) => toAssetView(viewerUserId, context.canModerate, asset)),
    storageUsedBytes: storageUsedBytes.toString(),
    viewerCanUpload: context.canUpload,
    viewerCanComment: context.canComment,
    viewerCanManageStorage: canManageGroupStorage(context, viewerUserId)
  };
}

export async function safeListGroupAssets(viewerUserId: string, groupIdOrSlug: string, requestedKind?: string | null) {
  try {
    return await listGroupAssets(viewerUserId, groupIdOrSlug, requestedKind);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list group media.", {
      viewerUserId,
      groupIdOrSlug,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load group media." };
  }
}

export async function createGroupAssetUploadIntent(viewerUserId: string, groupIdOrSlug: string, input: unknown) {
  const parsed = createGroupAssetUploadIntentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload." };
  }

  const context = await getGroupMediaContext(viewerUserId, groupIdOrSlug);

  if (!context?.canView) {
    return { ok: false as const, error: "Group not found." };
  }

  const uploadAllowed = await canUploadGroupAsset({
    groupId: context.group.id,
    canUpload: context.canUpload,
    isGroupMember: Boolean(context.membership),
    forumThreadId: parsed.data.forumThreadId
  });

  if (!uploadAllowed) {
    return { ok: false as const, error: "Uploads are only available to group creators, moderators, providers, or threads with photo replies enabled." };
  }

  const usedBytes = await currentGroupStorageBytes(context.group.id);
  const nextBytes = usedBytes + BigInt(parsed.data.sizeBytes);

  if (nextBytes > context.group.storageLimitBytes) {
    return { ok: false as const, error: "This group is at its assigned storage limit. Purge group files or raise the limit before uploading." };
  }

  const storageKey = [
    "groups",
    context.group.id,
    parsed.data.forumThreadId ? "forum" : parsed.data.kind.toLowerCase(),
    ...(parsed.data.forumThreadId ? [parsed.data.forumThreadId] : []),
    dateSlug(),
    `${randomBytes(8).toString("hex")}-${safeFileName(parsed.data.fileName)}`
  ].join("/");

  try {
    const uploadUrl = await createPresignedR2PutUrl({
      storageKey,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes
    });

    return {
      ok: true as const,
      uploadUrl,
      storageKey,
      publicUrl: getR2PublicUrl(storageKey),
      expiresInSeconds: 300
    };
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not create group media upload intent.", {
      viewerUserId,
      groupId: context.group.id,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Media storage is not configured." };
  }
}

export async function completeGroupAssetUpload(viewerUserId: string, groupIdOrSlug: string, input: unknown) {
  const parsed = completeGroupAssetUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid upload completion." };
  }

  const context = await getGroupMediaContext(viewerUserId, groupIdOrSlug);

  if (!context?.canView) {
    return { ok: false as const, error: "Group not found." };
  }

  const uploadAllowed = await canUploadGroupAsset({
    groupId: context.group.id,
    canUpload: context.canUpload,
    isGroupMember: Boolean(context.membership),
    forumThreadId: parsed.data.forumThreadId
  });

  if (!uploadAllowed) {
    return { ok: false as const, error: "Uploads are only available to group creators, moderators, providers, or threads with photo replies enabled." };
  }

  const usedBytes = await currentGroupStorageBytes(context.group.id);
  const nextBytes = usedBytes + BigInt(parsed.data.sizeBytes);

  if (nextBytes > context.group.storageLimitBytes) {
    return { ok: false as const, error: "This group is at its assigned storage limit. Purge group files or raise the limit before uploading." };
  }

  if (!parsed.data.storageKey.startsWith(`groups/${context.group.id}/`)) {
    return { ok: false as const, error: "Invalid group upload target." };
  }

  const uploadedObject = await verifyR2Object({
    storageKey: parsed.data.storageKey,
    expectedMimeType: parsed.data.mimeType,
    expectedSizeBytes: parsed.data.sizeBytes,
    label: "Group media upload"
  });

  if (!uploadedObject.ok) {
    return { ok: false as const, error: uploadedObject.error };
  }

  const mediaAsset = await prisma.mediaAsset.create({
    data: {
      ownerUserId: viewerUserId,
      storageKey: parsed.data.storageKey,
      publicUrl: getR2PublicUrl(parsed.data.storageKey),
      mimeType: parsed.data.mimeType,
      sizeBytes: BigInt(parsed.data.sizeBytes),
      originalName: parsed.data.fileName,
      visibility: MediaVisibility.MEMBERS,
      metadata: {
        groupId: context.group.id,
        kind: parsed.data.kind,
        forumThreadId: parsed.data.forumThreadId || null
      }
    }
  });

  const groupAsset = await prisma.groupAsset.create({
    data: {
      groupId: context.group.id,
      mediaAssetId: mediaAsset.id,
      uploaderUserId: viewerUserId,
      kind: parsed.data.kind,
      headline: parsed.data.headline || (parsed.data.forumThreadId ? `Forum photo: ${parsed.data.fileName}` : null),
      description: parsed.data.description || null
    }
  });

  await diagnostics.info(MODULE_KEY, "Group asset upload completed.", {
    viewerUserId,
    groupId: context.group.id,
    groupAssetId: groupAsset.id,
    mediaAssetId: mediaAsset.id,
    kind: groupAsset.kind
  });

  return { ok: true as const, asset: groupAsset };
}

export async function commentOnGroupAsset(viewerUserId: string, groupIdOrSlug: string, assetId: string, input: unknown) {
  const parsed = createGroupAssetCommentSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  const context = await getGroupMediaContext(viewerUserId, groupIdOrSlug);

  if (!context?.canView) {
    return { ok: false as const, error: "Group not found." };
  }

  if (!context.canComment) {
    return { ok: false as const, error: "Join the group before commenting." };
  }

  const asset = await prisma.groupAsset.findFirst({
    where: {
      id: assetId,
      groupId: context.group.id,
      deletedAt: null
    },
    select: {
      id: true
    }
  });

  if (!asset) {
    return { ok: false as const, error: "Asset not found." };
  }

  const comment = await prisma.groupAssetComment.create({
    data: {
      groupAssetId: asset.id,
      authorUserId: viewerUserId,
      body: parsed.data.body
    }
  });

  await diagnostics.info(MODULE_KEY, "Group asset comment created.", {
    viewerUserId,
    groupId: context.group.id,
    groupAssetId: asset.id,
    commentId: comment.id
  });

  return { ok: true as const, comment };
}

export async function deleteGroupAsset(viewerUserId: string, groupIdOrSlug: string, assetId: string) {
  const context = await getGroupMediaContext(viewerUserId, groupIdOrSlug);

  if (!context?.canView) {
    return { ok: false as const, error: "Group not found." };
  }

  const asset = await prisma.groupAsset.findFirst({
    where: {
      id: assetId,
      groupId: context.group.id,
      deletedAt: null
    },
    select: {
      id: true,
      uploaderUserId: true
    }
  });

  if (!asset) {
    return { ok: false as const, error: "Asset not found." };
  }

  if (!context.canModerate && asset.uploaderUserId !== viewerUserId) {
    return { ok: false as const, error: "Only the uploader or group moderators can delete this file." };
  }

  await prisma.groupAsset.update({
    where: {
      id: asset.id
    },
    data: {
      deletedAt: new Date()
    }
  });

  await diagnostics.info(MODULE_KEY, "Group asset deleted.", {
    viewerUserId,
    groupId: context.group.id,
    groupAssetId: asset.id
  });

  return { ok: true as const };
}

export async function updateGroupStorageLimit(viewerUserId: string, groupIdOrSlug: string, input: unknown) {
  const parsed = updateGroupStorageLimitSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid storage limit." };
  }

  const context = await getGroupMediaContext(viewerUserId, groupIdOrSlug);

  if (!context?.canView) {
    return { ok: false as const, error: "Group not found." };
  }

  if (!canManageGroupStorage(context, viewerUserId)) {
    return { ok: false as const, error: "Only the group creator or moderators can change group storage." };
  }

  const usedBytes = await currentGroupStorageBytes(context.group.id);
  const requestedLimit = BigInt(parsed.data.storageLimitBytes);

  if (requestedLimit < usedBytes) {
    return {
      ok: false as const,
      error: "This group is already using more storage than that. Purge storage first, then lower the assigned amount.",
      usedBytes: usedBytes.toString()
    };
  }

  const group = await prisma.group.update({
    where: { id: context.group.id },
    data: { storageLimitBytes: requestedLimit },
    select: {
      storageLimitBytes: true
    }
  });

  await diagnostics.info(MODULE_KEY, "Group storage limit updated.", {
    viewerUserId,
    groupId: context.group.id,
    storageLimitBytes: group.storageLimitBytes.toString()
  });

  return { ok: true as const, storageLimitBytes: group.storageLimitBytes.toString() };
}

export async function purgeGroupStorage(viewerUserId: string, passwordUserId: string, groupIdOrSlug: string, input: unknown) {
  const parsed = purgeGroupStorageSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid purge request." };
  }

  const context = await getGroupMediaContext(viewerUserId, groupIdOrSlug);

  if (!context?.canView) {
    return { ok: false as const, error: "Group not found." };
  }

  if (!canManageGroupStorage(context, viewerUserId)) {
    return { ok: false as const, error: "Only the group creator or moderators can purge group storage." };
  }

  if (parsed.data.action === "DELETE_ALL_CONTENT") {
    if (parsed.data.confirmationText !== "DELETE ALL") {
      return { ok: false as const, error: 'Type "DELETE ALL" to confirm this irreversible deletion.' };
    }

    const user = await prisma.user.findUnique({
      where: { id: passwordUserId },
      select: { passwordHash: true }
    });

    if (!user?.passwordHash || !parsed.data.password || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return { ok: false as const, error: "Password confirmation failed." };
    }
  }

  if (parsed.data.action === "PURGE_OLD_IMAGES_TO_LIMIT") {
    const targetLimit = BigInt(parsed.data.targetLimitBytes ?? Number(context.group.storageLimitBytes));
    let usedBytes = await currentGroupStorageBytes(context.group.id);
    const assets = await prisma.groupAsset.findMany({
      where: {
        groupId: context.group.id,
        kind: GroupAssetKind.PHOTO,
        deletedAt: null
      },
      include: {
        mediaAsset: {
          select: { sizeBytes: true }
        }
      },
      orderBy: { createdAt: "asc" }
    });
    const deleteIds: string[] = [];

    for (const asset of assets) {
      if (usedBytes <= targetLimit) break;
      deleteIds.push(asset.id);
      usedBytes -= asset.mediaAsset.sizeBytes;
    }

    const result = await hardDeleteGroupAssets(deleteIds);
    return { ok: true as const, ...result, storageUsedBytes: (await currentGroupStorageBytes(context.group.id)).toString() };
  }

  const assetsToDelete = await prisma.groupAsset.findMany({
    where: {
      groupId: context.group.id,
      ...(parsed.data.action === "PURGE_ALL_IMAGES" ? { kind: GroupAssetKind.PHOTO } : {}),
      deletedAt: null
    },
    select: { id: true }
  });
  const result = await hardDeleteGroupAssets(assetsToDelete.map((asset) => asset.id));

  if (parsed.data.action === "DELETE_ALL_CONTENT") {
    await prisma.groupForumThread.deleteMany({
      where: {
        groupId: context.group.id
      }
    });
  }

  await diagnostics.info(MODULE_KEY, "Group storage purged.", {
    viewerUserId,
    groupId: context.group.id,
    action: parsed.data.action,
    deletedCount: result.deletedCount,
    freedBytes: result.freedBytes.toString()
  });

  return { ok: true as const, ...result, storageUsedBytes: (await currentGroupStorageBytes(context.group.id)).toString() };
}
