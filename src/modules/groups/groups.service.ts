import {
  GroupJoinPolicy,
  GroupJoinRequestStatus,
  GroupMemberRole,
  GroupVisibility,
  Prisma,
  UserRole
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  createGroupSchema,
  groupDirectoryModeSchema,
  joinGroupSchema,
  pinGroupSchema,
  type GroupCardView,
  type GroupDirectoryMode,
  type GroupMemberView,
  type GroupProfileView
} from "@/modules/groups/types";

const MODULE_KEY = "groups";
const GROUP_DB_TIMEOUT_MS = 2500;

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
  }>
): GroupCardView {
  const membership = viewerMembership(viewerUserId, group);

  return {
    id: group.id,
    slug: group.slug,
    name: group.name,
    tagline: group.tagline,
    description: group.description,
    avatarUrl: group.avatarUrl,
    bannerUrl: group.bannerUrl,
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
  if (input.viewerRole === UserRole.ADMIN) return true;
  return input.group.members.some((member) => member.userId === input.viewerUserId);
}

async function getViewerRole(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return user?.role ?? UserRole.MEMBER;
}

export async function listGroups(input: {
  viewerUserId: string;
  mode?: string | null;
  query?: string | null;
}): Promise<GroupCardView[]> {
  const mode = groupDirectoryModeSchema.catch("joined").parse(input.mode ?? "joined") as GroupDirectoryMode;
  const cleanQuery = input.query?.trim();
  const viewerRole = await getViewerRole(input.viewerUserId);
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
      : mode === "discover" || cleanQuery
        ? viewerRole === UserRole.ADMIN
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
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 60
    }),
    "group directory lookup"
  );

  return groups
    .filter((group) => canViewPrivateGroup({ viewerUserId: input.viewerUserId, viewerRole, group }))
    .map((group) => toGroupCardView(input.viewerUserId, group))
    .sort((first, second) => Number(second.isPinned) - Number(first.isPinned));
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

  return { ok: true as const, group };
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
        viewerRole === UserRole.ADMIN ||
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

  if (profile.group.joinPolicy === GroupJoinPolicy.OPEN) {
    await prisma.groupMember.create({
      data: {
        groupId: profile.group.id,
        userId: viewerUserId,
        role: GroupMemberRole.MEMBER
      }
    });

    return { ok: true as const, status: "joined" };
  }

  const existingPending = await prisma.groupJoinRequest.findFirst({
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

  await prisma.groupJoinRequest.create({
    data: {
      groupId: profile.group.id,
      requesterUserId: viewerUserId,
      note: parsed.data.note || null
    }
  });

  return { ok: true as const, status: "pending" };
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
