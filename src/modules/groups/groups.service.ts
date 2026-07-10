import {
  GroupJoinPolicy,
  GroupJoinRequestStatus,
  GroupMemberRole,
  GroupVisibility,
  Prisma,
  SocialRelationshipType,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import { resolvePreferredThumbnailUrls } from "@/modules/media/media-thumbnails";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  MAX_GROUP_PARTICIPANTS,
  addGroupMemberSchema,
  createGroupSchema,
  groupDirectoryPageSchema,
  groupDirectoryModeSchema,
  groupMemberPageSchema,
  joinGroupSchema,
  pinGroupSchema,
  removeGroupMemberSchema,
  updateGroupMemberRoleSchema,
  type GroupCardView,
  type GroupDirectoryPageView,
  type GroupDirectoryMode,
  type GroupMemberPageView,
  type GroupMemberView,
  type GroupProfileView
} from "@/modules/groups/types";

const MODULE_KEY = "groups";
const GROUP_DB_TIMEOUT_MS = 2500;
const GROUP_TRANSACTION_RETRIES = 3;

type GroupDbClient = typeof prisma | Prisma.TransactionClient;

function withGroupDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), GROUP_DB_TIMEOUT_MS);
    })
  ]);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniqueGroupSlug(name: string) {
  const base = slugify(name) || "group";
  let candidate = base;
  let index = 2;

  while (await prisma.group.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

function toGroupMemberView(
  member: Prisma.GroupMemberGetPayload<{ include: { user: { include: { profile: true } } } }>
): GroupMemberView {
  return {
    id: member.userId,
    username: member.user.username,
    displayName: profileName(member.user),
    avatarUrl: member.user.profile?.avatarUrl,
    role: member.role,
    isProvider: member.isProvider
  };
}

function viewerMembership(
  viewerUserId: string,
  group: Prisma.GroupGetPayload<{ include: { members: true } }>
) {
  return group.members.find((member) => member.userId === viewerUserId);
}

function toGroupCardView(
  viewerUserId: string,
  group: Prisma.GroupGetPayload<{
    include: {
      members: true;
      pins: true;
      _count: { select: { members: true } };
    };
  }>,
  thumbnailUrls: Map<string, string> = new Map()
): GroupCardView {
  const membership = viewerMembership(viewerUserId, group);

  return {
    id: group.id,
    slug: group.slug,
    name: group.name,
    tagline: group.tagline,
    description: group.description,
    avatarUrl: thumbnailUrls.get(group.avatarUrl ?? "") ?? group.avatarUrl,
    bannerUrl: thumbnailUrls.get(group.bannerUrl ?? "") ?? group.bannerUrl,
    visibility: group.visibility,
    joinPolicy: group.joinPolicy,
    memberCount: group._count.members,
    viewerRole: membership?.role ?? null,
    isPinned: group.pins.some((pin) => pin.userId === viewerUserId),
    createdAt: group.createdAt.toISOString()
  };
}

function canViewPrivateGroup(input: {
  viewerUserId: string;
  viewerRole?: UserRole | null;
  group: Prisma.GroupGetPayload<{ include: { members: true } }>;
}) {
  if (input.group.visibility === GroupVisibility.PUBLIC) return true;
  if (isAdminRole(input.viewerRole)) return true;
  return input.group.members.some((member) => member.userId === input.viewerUserId);
}

async function getViewerRole(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId, deactivatedAt: null },
    select: { role: true }
  });

  return user?.role ?? null;
}

function activeUnblockedUserWhere(viewerUserId: string): Prisma.UserWhereInput {
  return {
    deactivatedAt: null,
    socialRelationshipsFrom: {
      none: {
        toUserId: viewerUserId,
        type: SocialRelationshipType.BLOCK
      }
    },
    socialRelationshipsTo: {
      none: {
        fromUserId: viewerUserId,
        type: SocialRelationshipType.BLOCK
      }
    }
  };
}

async function hasBlockBetween(firstUserId: string, secondUserId: string, client: GroupDbClient = prisma) {
  return Boolean(
    await client.socialRelationship.findFirst({
      where: {
        type: SocialRelationshipType.BLOCK,
        OR: [
          { fromUserId: firstUserId, toUserId: secondUserId },
          { fromUserId: secondUserId, toUserId: firstUserId }
        ]
      },
      select: { id: true }
    })
  );
}

async function runGroupTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; attempt <= GROUP_TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === GROUP_TRANSACTION_RETRIES) throw error;
    }
  }

  throw new Error("Group transaction retry limit reached.");
}

async function findGroupForManagement(client: GroupDbClient, groupIdOrSlug: string) {
  return client.group.findFirst({
    where: {
      archivedAt: null,
      OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }]
    },
    select: {
      id: true,
      createdByUserId: true,
      members: {
        select: { userId: true, role: true }
      }
    }
  });
}

function viewerCanModerate(
  viewerUserId: string,
  viewerRole: UserRole | null,
  group: { members: Array<{ userId: string; role: GroupMemberRole }> }
) {
  const membership = group.members.find((member) => member.userId === viewerUserId);
  return (
    isAdminRole(viewerRole) ||
    membership?.role === GroupMemberRole.OWNER ||
    membership?.role === GroupMemberRole.MODERATOR
  );
}

export async function listGroupsPage(input: {
  viewerUserId: string;
  mode?: string | null;
  query?: string | null;
  cursor?: string | null;
  limit?: number | null;
}): Promise<GroupDirectoryPageView> {
  const mode = groupDirectoryModeSchema.catch("joined").parse(input.mode ?? "joined") as GroupDirectoryMode;
  const page = groupDirectoryPageSchema.parse({
    cursor: input.cursor,
    limit: input.limit ?? undefined,
    query: input.query
  });
  const cleanQuery = page.query || undefined;
  const viewerRole = await getViewerRole(input.viewerUserId);

  if (!viewerRole) {
    return { groups: [], nextCursor: null };
  }

  const queryFilter = cleanQuery
    ? {
        OR: [
          { name: { contains: cleanQuery, mode: "insensitive" as const } },
          { tagline: { contains: cleanQuery, mode: "insensitive" as const } },
          { description: { contains: cleanQuery, mode: "insensitive" as const } }
        ]
      }
    : {};

  const baseWhere =
    mode === "mine"
      ? {
          members: {
            some: {
              userId: input.viewerUserId,
              role: { in: [GroupMemberRole.OWNER, GroupMemberRole.MODERATOR] }
            }
          }
        }
      : mode === "discover"
        ? isAdminRole(viewerRole)
          ? {}
          : { visibility: GroupVisibility.PUBLIC }
        : {
            members: {
              some: {
                userId: input.viewerUserId
              }
            }
          };

  const groups = await withGroupDbTimeout(
    prisma.group.findMany({
      where: {
        archivedAt: null,
        ...baseWhere,
        ...queryFilter
      },
      include: {
        members: true,
        pins: {
          where: {
            userId: input.viewerUserId
          }
        },
        _count: {
          select: {
            members: true
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
      take: page.limit + 1
    }),
    "group directory lookup"
  );
  const hasMore = groups.length > page.limit;
  const visibleGroups = groups.slice(0, page.limit);
  const thumbnailUrls = await resolvePreferredThumbnailUrls(
    visibleGroups.flatMap((group) => [group.avatarUrl, group.bannerUrl])
  );

  return {
    groups: visibleGroups
    .filter((group) => canViewPrivateGroup({ viewerUserId: input.viewerUserId, viewerRole, group }))
      .map((group) => toGroupCardView(input.viewerUserId, group, thumbnailUrls)),
    nextCursor: hasMore ? visibleGroups.at(-1)?.id ?? null : null
  };
}

export async function listGroups(input: {
  viewerUserId: string;
  mode?: string | null;
  query?: string | null;
}): Promise<GroupCardView[]> {
  const page = await listGroupsPage(input);
  return page.groups;
}

export async function safeListGroups(input: { viewerUserId: string; mode?: string | null; query?: string | null }) {
  try {
    return await listGroups(input);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list groups.", {
      viewerUserId: input.viewerUserId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function createGroup(viewerUserId: string, input: unknown) {
  const parsed = createGroupSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid group." };
  }

  const access = await canUserAccessFeature(viewerUserId, "groups.create");

  if (!access.allowed) {
    return { ok: false as const, error: access.reason };
  }

  const slug = await uniqueGroupSlug(parsed.data.name);
  const group = await prisma.group.create({
    data: {
      slug,
      name: parsed.data.name,
      tagline: parsed.data.tagline || null,
      description: parsed.data.description || null,
      visibility: parsed.data.visibility,
      joinPolicy: parsed.data.joinPolicy,
      createdByUserId: viewerUserId,
      members: {
        create: {
          userId: viewerUserId,
          role: GroupMemberRole.OWNER
        }
      },
      pins: {
        create: {
          userId: viewerUserId,
          sortOrder: 0
        }
      }
    }
  });

  await diagnostics.info(MODULE_KEY, "Group created.", {
    viewerUserId,
    groupId: group.id,
    visibility: group.visibility
  });

  return {
    ok: true as const,
    group: {
      id: group.id,
      slug: group.slug,
      name: group.name,
      visibility: group.visibility,
      joinPolicy: group.joinPolicy,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString()
    }
  };
}

export async function getGroupProfile(viewerUserId: string, groupIdOrSlug: string) {
  const viewerRole = await getViewerRole(viewerUserId);
  const group = await prisma.group.findFirst({
    where: {
      archivedAt: null,
      OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }]
    },
    include: {
      createdBy: {
        include: {
          profile: true
        }
      },
      members: {
        where: {
          user: {
            is: activeUnblockedUserWhere(viewerUserId)
          }
        },
        include: {
          user: {
            include: {
              profile: true
            }
          }
        },
        orderBy: [{ role: "desc" }, { createdAt: "asc" }],
        take: 12
      },
      joinRequests: {
        where: {
          requesterUserId: viewerUserId,
          status: GroupJoinRequestStatus.PENDING
        },
        take: 1
      },
      pins: {
        where: {
          userId: viewerUserId
        }
      },
      _count: {
        select: {
          members: true
        }
      }
    }
  });

  if (!group || !canViewPrivateGroup({ viewerUserId, viewerRole, group })) {
    return { ok: false as const, error: "Group not found." };
  }

  const card = toGroupCardView(viewerUserId, group);
  const viewerMember = viewerMembership(viewerUserId, group);
  const moderators = group.members
    .filter((member) => member.role === GroupMemberRole.OWNER || member.role === GroupMemberRole.MODERATOR)
    .map(toGroupMemberView);

  return {
    ok: true as const,
    group: {
      ...card,
      creator: group.createdBy
        ? {
            username: group.createdBy.username,
            displayName: profileName(group.createdBy),
            avatarUrl: group.createdBy.profile?.avatarUrl
          }
        : null,
      moderators,
      membersPreview: group.members.map(toGroupMemberView),
      canJoin: !viewerMember,
      canModerate:
        isAdminRole(viewerRole) ||
        viewerMember?.role === GroupMemberRole.OWNER ||
        viewerMember?.role === GroupMemberRole.MODERATOR,
      pendingJoinRequest: group.joinRequests.length > 0
    } satisfies GroupProfileView
  };
}

export async function joinGroup(viewerUserId: string, groupIdOrSlug: string, input: unknown) {
  const parsed = joinGroupSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const profile = await getGroupProfile(viewerUserId, groupIdOrSlug);

  if (!profile.ok) {
    return profile;
  }

  if (!profile.group.canJoin) {
    return { ok: true as const, status: "already-member" };
  }

  return runGroupTransaction(async (tx) => {
    const [viewer, group, existingMember, memberCount] = await Promise.all([
      tx.user.findFirst({
        where: { id: viewerUserId, deactivatedAt: null },
        select: { id: true }
      }),
      findGroupForManagement(tx, profile.group.id),
      tx.groupMember.findUnique({
        where: { groupId_userId: { groupId: profile.group.id, userId: viewerUserId } },
        select: { id: true }
      }),
      tx.groupMember.count({ where: { groupId: profile.group.id } })
    ]);

    if (!viewer || !group) {
      return { ok: false as const, error: "Group not found." };
    }

    if (existingMember) {
      return { ok: true as const, status: "already-member" };
    }

    if (group.createdByUserId && (await hasBlockBetween(viewerUserId, group.createdByUserId, tx))) {
      return { ok: false as const, error: "Group not found." };
    }

    if (profile.group.joinPolicy === GroupJoinPolicy.OPEN) {
      if (memberCount >= MAX_GROUP_PARTICIPANTS) {
        return { ok: false as const, error: "This group has reached its member limit." };
      }

      await tx.groupMember.create({
        data: {
          groupId: profile.group.id,
          userId: viewerUserId,
          role: GroupMemberRole.MEMBER
        }
      });

      return { ok: true as const, status: "joined" };
    }

    const existingPending = await tx.groupJoinRequest.findFirst({
      where: {
        groupId: profile.group.id,
        requesterUserId: viewerUserId,
        status: GroupJoinRequestStatus.PENDING
      },
      select: { id: true }
    });

    if (existingPending) {
      return { ok: true as const, status: "pending" };
    }

    await tx.groupJoinRequest.create({
      data: {
        groupId: profile.group.id,
        requesterUserId: viewerUserId,
        note: parsed.data.note || null
      }
    });

    return { ok: true as const, status: "pending" };
  });
}

export async function listGroupMembers(
  viewerUserId: string,
  groupIdOrSlug: string,
  input: { cursor?: string | null; limit?: number | null } = {}
): Promise<{ ok: true; page: GroupMemberPageView } | { ok: false; error: string }> {
  const page = groupMemberPageSchema.parse({
    cursor: input.cursor,
    limit: input.limit ?? undefined
  });
  const viewerRole = await getViewerRole(viewerUserId);
  const group = await prisma.group.findFirst({
    where: {
      archivedAt: null,
      OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }]
    },
    include: { members: true }
  });

  if (!viewerRole || !group || !canViewPrivateGroup({ viewerUserId, viewerRole, group })) {
    return { ok: false, error: "Group not found." };
  }

  const members = await prisma.groupMember.findMany({
    where: {
      groupId: group.id,
      user: {
        is: activeUnblockedUserWhere(viewerUserId)
      }
    },
    include: {
      user: {
        include: { profile: true }
      }
    },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    take: page.limit + 1
  });
  const hasMore = members.length > page.limit;
  const visibleMembers = members.slice(0, page.limit);

  return {
    ok: true,
    page: {
      members: visibleMembers.map(toGroupMemberView),
      nextCursor: hasMore ? visibleMembers.at(-1)?.id ?? null : null
    }
  };
}

export async function addGroupMember(viewerUserId: string, groupIdOrSlug: string, input: unknown) {
  const parsed = addGroupMemberSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Choose a member to add." };
  }

  const viewerRole = await getViewerRole(viewerUserId);
  if (!viewerRole) return { ok: false as const, error: "Group not found." };

  return runGroupTransaction(async (tx) => {
    const group = await findGroupForManagement(tx, groupIdOrSlug);
    if (!group || !viewerCanModerate(viewerUserId, viewerRole, group)) {
      return { ok: false as const, error: "Group not found." };
    }

    const target = await tx.user.findFirst({
      where: {
        ...activeUnblockedUserWhere(viewerUserId),
        ...(parsed.data.userId
          ? { id: parsed.data.userId }
          : { username: { equals: parsed.data.username, mode: "insensitive" } })
      },
      select: { id: true, username: true }
    });

    if (!target || (await hasBlockBetween(viewerUserId, target.id, tx))) {
      return { ok: false as const, error: "That member is not available." };
    }

    const existingMember = group.members.find((member) => member.userId === target.id);
    if (existingMember) {
      return { ok: true as const, status: "already-member", memberId: target.id };
    }

    if (group.members.length >= MAX_GROUP_PARTICIPANTS) {
      return { ok: false as const, error: "This group has reached its member limit." };
    }

    await tx.groupMember.create({
      data: { groupId: group.id, userId: target.id, role: GroupMemberRole.MEMBER }
    });
    await tx.groupJoinRequest.updateMany({
      where: {
        groupId: group.id,
        requesterUserId: target.id,
        status: GroupJoinRequestStatus.PENDING
      },
      data: {
        status: GroupJoinRequestStatus.APPROVED,
        reviewedByUserId: viewerUserId,
        reviewedAt: new Date()
      }
    });

    return { ok: true as const, status: "added", memberId: target.id };
  });
}

export const inviteGroupMember = addGroupMember;

export async function updateGroupMemberRole(viewerUserId: string, groupIdOrSlug: string, input: unknown) {
  const parsed = updateGroupMemberRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid role change." };

  const viewerRole = await getViewerRole(viewerUserId);
  if (!viewerRole) return { ok: false as const, error: "Group not found." };

  return runGroupTransaction(async (tx) => {
    const group = await findGroupForManagement(tx, groupIdOrSlug);
    const viewerMember = group?.members.find((member) => member.userId === viewerUserId);
    if (!group || (!isAdminRole(viewerRole) && viewerMember?.role !== GroupMemberRole.OWNER)) {
      return { ok: false as const, error: "Group not found." };
    }

    const target = group.members.find((member) => member.userId === parsed.data.targetUserId);
    if (!target || target.role === GroupMemberRole.OWNER) {
      return { ok: false as const, error: "That member's role cannot be changed." };
    }

    await tx.groupMember.update({
      where: { groupId_userId: { groupId: group.id, userId: target.userId } },
      data: { role: parsed.data.role }
    });
    return { ok: true as const };
  });
}

export async function removeGroupMember(viewerUserId: string, groupIdOrSlug: string, input: unknown) {
  const parsed = removeGroupMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid member removal." };

  const viewerRole = await getViewerRole(viewerUserId);
  if (!viewerRole) return { ok: false as const, error: "Group not found." };

  return runGroupTransaction(async (tx) => {
    const group = await findGroupForManagement(tx, groupIdOrSlug);
    if (!group || !viewerCanModerate(viewerUserId, viewerRole, group)) {
      return { ok: false as const, error: "Group not found." };
    }

    const viewerMember = group.members.find((member) => member.userId === viewerUserId);
    const target = group.members.find((member) => member.userId === parsed.data.targetUserId);
    if (
      !target ||
      target.role === GroupMemberRole.OWNER ||
      (!isAdminRole(viewerRole) &&
        viewerMember?.role === GroupMemberRole.MODERATOR &&
        target.role !== GroupMemberRole.MEMBER)
    ) {
      return { ok: false as const, error: "That member cannot be removed." };
    }

    await tx.groupMember.delete({
      where: { groupId_userId: { groupId: group.id, userId: target.userId } }
    });
    await tx.groupUserPin.deleteMany({ where: { groupId: group.id, userId: target.userId } });
    return { ok: true as const };
  });
}

export async function leaveGroup(viewerUserId: string, groupIdOrSlug: string) {
  return runGroupTransaction(async (tx) => {
    const group = await findGroupForManagement(tx, groupIdOrSlug);
    const membership = group?.members.find((member) => member.userId === viewerUserId);
    if (!group || !membership) return { ok: false as const, error: "Group not found." };

    const replacementOwner = group.members.find(
      (member) => member.userId !== viewerUserId && member.role === GroupMemberRole.OWNER
    );
    if (membership.role === GroupMemberRole.OWNER && !replacementOwner) {
      return { ok: false as const, error: "Assign another owner before leaving this group." };
    }

    await tx.groupMember.delete({
      where: { groupId_userId: { groupId: group.id, userId: viewerUserId } }
    });
    await tx.groupUserPin.deleteMany({ where: { groupId: group.id, userId: viewerUserId } });
    if (group.createdByUserId === viewerUserId && replacementOwner) {
      await tx.group.update({
        where: { id: group.id },
        data: { createdByUserId: replacementOwner.userId }
      });
    }

    return { ok: true as const };
  });
}

export async function pinGroup(viewerUserId: string, groupIdOrSlug: string, input: unknown) {
  const parsed = pinGroupSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid pin request." };
  }

  const profile = await getGroupProfile(viewerUserId, groupIdOrSlug);

  if (!profile.ok) {
    return profile;
  }

  if (parsed.data.pinned) {
    await prisma.groupUserPin.upsert({
      where: {
        userId_groupId: {
          userId: viewerUserId,
          groupId: profile.group.id
        }
      },
      update: {
        sortOrder: parsed.data.sortOrder
      },
      create: {
        userId: viewerUserId,
        groupId: profile.group.id,
        sortOrder: parsed.data.sortOrder
      }
    });
  } else {
    await prisma.groupUserPin.deleteMany({
      where: {
        userId: viewerUserId,
        groupId: profile.group.id
      }
    });
  }

  return { ok: true as const };
}
