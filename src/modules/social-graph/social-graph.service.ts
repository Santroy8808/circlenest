import {
  FamilyRelationshipRequestStatus,
  FriendRelationshipRequestStatus,
  Prisma,
  ProfileVisibility,
  SocialRelationshipType
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { isAdminRole } from "@/lib/platform/roles";
import { cuidIdSchema } from "@/lib/platform/validation";
import { resolvePreferredThumbnailUrls } from "@/modules/media/media-thumbnails";
import {
  ensureFamilyRequestNotification,
  ensureFriendRequestNotification,
  notifyFamilyRequestOutcome,
  notifyFriendRequestOutcome
} from "@/modules/notifications-alerts/notifications-alerts.service";
import {
  familyRelationshipRequestSchema,
  familyRelationshipResponseSchema,
  friendRelationshipRequestSchema,
  friendRelationshipResponseSchema,
  type FamilyMemberView,
  type PeopleCardView,
  removeRelationshipSchema,
  setRelationshipSchema
} from "@/modules/social-graph/types";

const MODULE_KEY = "social-graph";
const SOCIAL_DB_TIMEOUT_MS = 2500;
const SOCIAL_TRANSACTION_RETRIES = 3;
const PEOPLE_RELATIONSHIP_TYPES: SocialRelationshipType[] = [
  SocialRelationshipType.FRIEND,
  SocialRelationshipType.FAMILY,
  SocialRelationshipType.ACQUAINTANCE,
  SocialRelationshipType.CONTACT
];

function withSocialDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), SOCIAL_DB_TIMEOUT_MS);
    })
  ]);
}

function reciprocalFamilyLabel(label: string) {
  const reciprocalMap: Record<string, string> = {
    Spouse: "Spouse",
    Parent: "Child",
    Progeny: "Parent",
    Child: "Parent",
    Family: "Family",
    Sibling: "Sibling",
    Grandparent: "Grandchild",
    Grandchild: "Grandparent",
    "Aunt/Uncle": "Niece/Nephew",
    "Niece/Nephew": "Aunt/Uncle",
    Cousin: "Cousin",
    "In-law": "In-law",
    "Other family": "Other family"
  };

  return reciprocalMap[label] ?? "Family";
}

type SocialDbClient = typeof prisma | Prisma.TransactionClient;

async function serializableSocialTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; attempt <= SOCIAL_TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === SOCIAL_TRANSACTION_RETRIES) throw error;
    }
  }

  throw new Error("Social transaction retry limit reached.");
}

async function hasBlockBetween(firstUserId: string, secondUserId: string, client: SocialDbClient = prisma) {
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

function unblockedUserWhere(viewerUserId: string): Prisma.UserWhereInput {
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

function relationshipTypeScope(
  userId: string,
  types: SocialRelationshipType[]
): Prisma.SocialRelationshipWhereInput {
  return {
    OR: types.map((type) =>
      type === SocialRelationshipType.FRIEND || type === SocialRelationshipType.FAMILY
        ? {
            type,
            toUser: {
              is: {
                socialRelationshipsFrom: {
                  some: {
                    toUserId: userId,
                    type
                  }
                }
              }
            }
          }
        : { type }
    )
  };
}

export async function setSocialRelationship(fromUserId: string, input: unknown) {
  const parsed = setRelationshipSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid relationship." };
  }

  if (parsed.data.toUserId === fromUserId) {
    return { ok: false as const, error: "You cannot create a relationship to yourself." };
  }

  if (
    parsed.data.type === SocialRelationshipType.FRIEND ||
    parsed.data.type === SocialRelationshipType.FAMILY
  ) {
    return { ok: false as const, error: "Friend and family relationships must be approved first." };
  }

  const result = await serializableSocialTransaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.user.findFirst({
        where: { id: fromUserId, deactivatedAt: null },
        select: { id: true }
      }),
      tx.user.findFirst({
        where: { id: parsed.data.toUserId, deactivatedAt: null },
        select: { id: true }
      })
    ]);

    if (!source || !target) {
      return { ok: false as const, error: "That member was not found." };
    }

    if (
      parsed.data.type !== SocialRelationshipType.BLOCK &&
      (await hasBlockBetween(source.id, target.id, tx))
    ) {
      return { ok: false as const, error: "That relationship is not available." };
    }

    const saved = await tx.socialRelationship.upsert({
      where: {
        fromUserId_toUserId_type: {
          fromUserId,
          toUserId: target.id,
          type: parsed.data.type
        }
      },
      update: {
        note: parsed.data.note || null
      },
      create: {
        fromUserId,
        toUserId: target.id,
        type: parsed.data.type,
        note: parsed.data.note || null
      }
    });

    if (parsed.data.type === SocialRelationshipType.BLOCK) {
      const now = new Date();
      const pairWhere = {
        OR: [
          { requesterUserId: source.id, targetUserId: target.id },
          { requesterUserId: target.id, targetUserId: source.id }
        ]
      };
      const [friendRequests, familyRequests] = await Promise.all([
        tx.friendRelationshipRequest.findMany({
          where: {
            status: FriendRelationshipRequestStatus.PENDING,
            ...pairWhere
          },
          select: { notificationId: true, alertId: true }
        }),
        tx.familyRelationshipRequest.findMany({
          where: {
            status: FamilyRelationshipRequestStatus.PENDING,
            ...pairWhere
          },
          select: { notificationId: true, alertId: true }
        })
      ]);

      await tx.socialRelationship.deleteMany({
        where: {
          type: { not: SocialRelationshipType.BLOCK },
          OR: [
            { fromUserId: source.id, toUserId: target.id },
            { fromUserId: target.id, toUserId: source.id }
          ]
        }
      });
      await tx.friendRelationshipRequest.updateMany({
        where: {
          status: FriendRelationshipRequestStatus.PENDING,
          ...pairWhere
        },
        data: { status: FriendRelationshipRequestStatus.CANCELED, respondedAt: now }
      });
      await tx.familyRelationshipRequest.updateMany({
        where: {
          status: FamilyRelationshipRequestStatus.PENDING,
          ...pairWhere
        },
        data: { status: FamilyRelationshipRequestStatus.CANCELED, respondedAt: now }
      });

      const notificationIds = [...friendRequests, ...familyRequests]
        .map((request) => request.notificationId)
        .filter((id): id is string => Boolean(id));
      const alertIds = [...friendRequests, ...familyRequests]
        .map((request) => request.alertId)
        .filter((id): id is string => Boolean(id));

      if (notificationIds.length > 0) {
        await tx.notification.deleteMany({ where: { id: { in: notificationIds } } });
      }

      if (alertIds.length > 0) {
        await tx.alert.deleteMany({ where: { id: { in: alertIds } } });
      }
    }

    return { ok: true as const, relationship: saved };
  });

  if (!result.ok) return result;

  await diagnostics.info(MODULE_KEY, "Social relationship set.", {
    fromUserId,
    toUserId: parsed.data.toUserId,
    type: parsed.data.type
  });

  return { ok: true as const, relationship: result.relationship };
}

export async function requestFriendRelationship(requesterUserId: string, input: unknown) {
  const parsed = friendRelationshipRequestSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid friend request." };
  }

  if (parsed.data.targetUserId === requesterUserId) {
    return { ok: false as const, error: "You cannot send a friend request to yourself." };
  }

  const result = await serializableSocialTransaction(async (tx) => {
    const [requester, target, friendEdges, pendingSent, pendingReceived, blocked] = await Promise.all([
      tx.user.findFirst({
        where: { id: requesterUserId, deactivatedAt: null },
        select: { id: true }
      }),
      tx.user.findFirst({
        where: { id: parsed.data.targetUserId, deactivatedAt: null },
        include: { profile: true }
      }),
      tx.socialRelationship.findMany({
        where: {
          type: SocialRelationshipType.FRIEND,
          OR: [
            { fromUserId: requesterUserId, toUserId: parsed.data.targetUserId },
            { fromUserId: parsed.data.targetUserId, toUserId: requesterUserId }
          ]
        },
        select: { fromUserId: true, toUserId: true }
      }),
      tx.friendRelationshipRequest.findFirst({
        where: {
          requesterUserId,
          targetUserId: parsed.data.targetUserId,
          status: FriendRelationshipRequestStatus.PENDING
        },
        select: { id: true }
      }),
      tx.friendRelationshipRequest.findFirst({
        where: {
          requesterUserId: parsed.data.targetUserId,
          targetUserId: requesterUserId,
          status: FriendRelationshipRequestStatus.PENDING
        },
        select: { id: true }
      }),
      hasBlockBetween(requesterUserId, parsed.data.targetUserId, tx)
    ]);

    if (!requester || !target) {
      return { ok: false as const, error: "That member was not found." };
    }

    if (blocked) {
      return { ok: false as const, error: "That friend request is not available." };
    }

    const reciprocalFriend =
      friendEdges.some(
        (edge) => edge.fromUserId === requester.id && edge.toUserId === target.id
      ) &&
      friendEdges.some(
        (edge) => edge.fromUserId === target.id && edge.toUserId === requester.id
      );

    if (reciprocalFriend) {
      return { ok: false as const, error: "That member is already in your friends list." };
    }

    if (pendingSent) {
      return { ok: false as const, error: "A friend request is already pending." };
    }

    if (pendingReceived) {
      return {
        ok: false as const,
        error: "That member already sent you a friend request. Open Notifications to approve it."
      };
    }

    if (friendEdges.length > 0) {
      await tx.socialRelationship.deleteMany({
        where: {
          type: SocialRelationshipType.FRIEND,
          OR: [
            { fromUserId: requester.id, toUserId: target.id },
            { fromUserId: target.id, toUserId: requester.id }
          ]
        }
      });
    }

    const targetName = target.profile?.displayName ?? target.username;
    const request = await tx.friendRelationshipRequest.create({
      data: {
        requesterUserId: requester.id,
        targetUserId: target.id,
        message: parsed.data.message || null
      }
    });

    await ensureFriendRequestNotification(request.id, tx);

    return {
      ok: true as const,
      request: { id: request.id, targetName },
      targetUserId: target.id
    };
  });

  if (!result.ok) return result;

  await diagnostics.info(MODULE_KEY, "Friend relationship request created.", {
    requesterUserId,
    targetUserId: result.targetUserId
  });

  return {
    ok: true as const,
    request: result.request
  };
}

export async function respondToFriendRelationshipRequest(targetUserId: string, requestId: string, input: unknown) {
  const parsed = friendRelationshipResponseSchema.safeParse(input);
  const parsedRequestId = cuidIdSchema.safeParse(requestId);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid response." };
  }

  if (!parsedRequestId.success) {
    return { ok: false as const, error: "That friend request was not found or is no longer pending." };
  }

  const result = await serializableSocialTransaction(async (tx) => {
    const request = await tx.friendRelationshipRequest.findFirst({
      where: {
        id: parsedRequestId.data,
        targetUserId,
        status: FriendRelationshipRequestStatus.PENDING
      },
      include: {
        requester: { select: { deactivatedAt: true } },
        target: { select: { deactivatedAt: true } }
      }
    });

    if (!request) {
      return { ok: false as const, error: "That friend request was not found or is no longer pending." };
    }

    const now = new Date();

    const blocked = await hasBlockBetween(request.requesterUserId, request.targetUserId, tx);

    if (
      blocked ||
      (parsed.data.action === "approve" && (request.requester.deactivatedAt || request.target.deactivatedAt))
    ) {
        await tx.friendRelationshipRequest.updateMany({
          where: { id: request.id, targetUserId, status: FriendRelationshipRequestStatus.PENDING },
          data: { status: FriendRelationshipRequestStatus.CANCELED, respondedAt: now }
        });

        if (request.notificationId) {
          await tx.notification.deleteMany({ where: { id: request.notificationId, userId: targetUserId } });
        }

        if (request.alertId) {
          await tx.alert.deleteMany({ where: { id: request.alertId, userId: targetUserId } });
        }

        return { ok: false as const, error: "That friend request is no longer available." };
    }

    const nextStatus =
      parsed.data.action === "approve"
        ? FriendRelationshipRequestStatus.APPROVED
        : FriendRelationshipRequestStatus.DENIED;
    const claimed = await tx.friendRelationshipRequest.updateMany({
      where: { id: request.id, targetUserId, status: FriendRelationshipRequestStatus.PENDING },
      data: { status: nextStatus, respondedAt: now }
    });

    if (claimed.count === 0) {
      return { ok: false as const, error: "That friend request was not found or is no longer pending." };
    }

    if (parsed.data.action === "approve") {
      await tx.socialRelationship.upsert({
        where: {
          fromUserId_toUserId_type: {
            fromUserId: request.requesterUserId,
            toUserId: request.targetUserId,
            type: SocialRelationshipType.FRIEND
          }
        },
        update: {},
        create: {
          fromUserId: request.requesterUserId,
          toUserId: request.targetUserId,
          type: SocialRelationshipType.FRIEND
        }
      });
      await tx.socialRelationship.upsert({
        where: {
          fromUserId_toUserId_type: {
            fromUserId: request.targetUserId,
            toUserId: request.requesterUserId,
            type: SocialRelationshipType.FRIEND
          }
        },
        update: {},
        create: {
          fromUserId: request.targetUserId,
          toUserId: request.requesterUserId,
          type: SocialRelationshipType.FRIEND
        }
      });
    }

    await notifyFriendRequestOutcome(request.id, tx);

    return {
      ok: true as const,
      status: nextStatus,
      requesterUserId: request.requesterUserId,
      requestTargetUserId: request.targetUserId
    };
  });

  if (!result.ok) return result;

  if (result.status === FriendRelationshipRequestStatus.APPROVED) {
    await diagnostics.info(MODULE_KEY, "Friend relationship request approved.", {
      requesterUserId: result.requesterUserId,
      targetUserId: result.requestTargetUserId
    });
  }

  return { ok: true as const, status: result.status };
}

export async function requestFamilyRelationship(requesterUserId: string, input: unknown) {
  const parsed = familyRelationshipRequestSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid family request." };
  }

  if (parsed.data.targetUserId === requesterUserId) {
    return { ok: false as const, error: "You cannot tag yourself as family." };
  }

  const result = await serializableSocialTransaction(async (tx) => {
    const [requester, target, familyEdges, pendingRequest, pendingReverse, blocked] = await Promise.all([
      tx.user.findFirst({
        where: { id: requesterUserId, deactivatedAt: null },
        select: { id: true }
      }),
      tx.user.findFirst({
        where: { id: parsed.data.targetUserId, deactivatedAt: null },
        include: { profile: true }
      }),
      tx.socialRelationship.findMany({
        where: {
          type: SocialRelationshipType.FAMILY,
          OR: [
            { fromUserId: requesterUserId, toUserId: parsed.data.targetUserId },
            { fromUserId: parsed.data.targetUserId, toUserId: requesterUserId }
          ]
        },
        select: { fromUserId: true, toUserId: true }
      }),
      tx.familyRelationshipRequest.findFirst({
        where: {
          requesterUserId,
          targetUserId: parsed.data.targetUserId,
          status: FamilyRelationshipRequestStatus.PENDING
        },
        select: { id: true }
      }),
      tx.familyRelationshipRequest.findFirst({
        where: {
          requesterUserId: parsed.data.targetUserId,
          targetUserId: requesterUserId,
          status: FamilyRelationshipRequestStatus.PENDING
        },
        select: { id: true }
      }),
      hasBlockBetween(requesterUserId, parsed.data.targetUserId, tx)
    ]);

    if (!requester || !target) {
      return { ok: false as const, error: "That member was not found." };
    }

    if (blocked) {
      return { ok: false as const, error: "That family request is not available." };
    }

    const reciprocalFamily =
      familyEdges.some(
        (edge) => edge.fromUserId === requester.id && edge.toUserId === target.id
      ) &&
      familyEdges.some(
        (edge) => edge.fromUserId === target.id && edge.toUserId === requester.id
      );

    if (reciprocalFamily) {
      return { ok: false as const, error: "That member is already tagged as family." };
    }

    if (pendingRequest || pendingReverse) {
      return { ok: false as const, error: "A family approval request is already pending." };
    }

    if (familyEdges.length > 0) {
      await tx.socialRelationship.deleteMany({
        where: {
          type: SocialRelationshipType.FAMILY,
          OR: [
            { fromUserId: requester.id, toUserId: target.id },
            { fromUserId: target.id, toUserId: requester.id }
          ]
        }
      });
    }

    const targetName = target.profile?.displayName ?? target.username;
    const request = await tx.familyRelationshipRequest.create({
      data: {
        requesterUserId: requester.id,
        targetUserId: target.id,
        relationshipLabel: parsed.data.relationshipLabel,
        reciprocalLabel: reciprocalFamilyLabel(parsed.data.relationshipLabel),
        message: parsed.data.message || null
      }
    });

    await ensureFamilyRequestNotification(request.id, tx);

    return {
      ok: true as const,
      request: {
        id: request.id,
        targetName,
        relationshipLabel: parsed.data.relationshipLabel
      },
      targetUserId: target.id
    };
  });

  if (!result.ok) return result;

  await diagnostics.info(MODULE_KEY, "Family relationship request created.", {
    requesterUserId,
    targetUserId: result.targetUserId,
    relationshipLabel: parsed.data.relationshipLabel
  });

  return {
    ok: true as const,
    request: result.request
  };
}

export async function respondToFamilyRelationshipRequest(targetUserId: string, requestId: string, input: unknown) {
  const parsed = familyRelationshipResponseSchema.safeParse(input);
  const parsedRequestId = cuidIdSchema.safeParse(requestId);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid response." };
  }

  if (!parsedRequestId.success) {
    return { ok: false as const, error: "That family request was not found or is no longer pending." };
  }

  const result = await serializableSocialTransaction(async (tx) => {
    const request = await tx.familyRelationshipRequest.findFirst({
      where: {
        id: parsedRequestId.data,
        targetUserId,
        status: FamilyRelationshipRequestStatus.PENDING
      },
      include: {
        requester: { select: { deactivatedAt: true } },
        target: { select: { deactivatedAt: true } }
      }
    });

    if (!request) {
      return { ok: false as const, error: "That family request was not found or is no longer pending." };
    }

    const now = new Date();

    const blocked = await hasBlockBetween(request.requesterUserId, request.targetUserId, tx);

    if (
      blocked ||
      (parsed.data.action === "approve" && (request.requester.deactivatedAt || request.target.deactivatedAt))
    ) {
        await tx.familyRelationshipRequest.updateMany({
          where: { id: request.id, targetUserId, status: FamilyRelationshipRequestStatus.PENDING },
          data: { status: FamilyRelationshipRequestStatus.CANCELED, respondedAt: now }
        });

        if (request.notificationId) {
          await tx.notification.deleteMany({ where: { id: request.notificationId, userId: targetUserId } });
        }

        if (request.alertId) {
          await tx.alert.deleteMany({ where: { id: request.alertId, userId: targetUserId } });
        }

        return { ok: false as const, error: "That family request is no longer available." };
    }

    const nextStatus =
      parsed.data.action === "approve"
        ? FamilyRelationshipRequestStatus.APPROVED
        : FamilyRelationshipRequestStatus.DENIED;
    const claimed = await tx.familyRelationshipRequest.updateMany({
      where: { id: request.id, targetUserId, status: FamilyRelationshipRequestStatus.PENDING },
      data: { status: nextStatus, respondedAt: now }
    });

    if (claimed.count === 0) {
      return { ok: false as const, error: "That family request was not found or is no longer pending." };
    }

    if (parsed.data.action === "approve") {
      await tx.socialRelationship.upsert({
        where: {
          fromUserId_toUserId_type: {
            fromUserId: request.requesterUserId,
            toUserId: request.targetUserId,
            type: SocialRelationshipType.FAMILY
          }
        },
        update: { note: request.relationshipLabel },
        create: {
          fromUserId: request.requesterUserId,
          toUserId: request.targetUserId,
          type: SocialRelationshipType.FAMILY,
          note: request.relationshipLabel
        }
      });
      await tx.socialRelationship.upsert({
        where: {
          fromUserId_toUserId_type: {
            fromUserId: request.targetUserId,
            toUserId: request.requesterUserId,
            type: SocialRelationshipType.FAMILY
          }
        },
        update: { note: request.reciprocalLabel },
        create: {
          fromUserId: request.targetUserId,
          toUserId: request.requesterUserId,
          type: SocialRelationshipType.FAMILY,
          note: request.reciprocalLabel
        }
      });
    }

    await notifyFamilyRequestOutcome(request.id, tx);

    return {
      ok: true as const,
      status: nextStatus,
      requesterUserId: request.requesterUserId,
      requestTargetUserId: request.targetUserId,
      relationshipLabel: request.relationshipLabel
    };
  });

  if (!result.ok) return result;

  if (result.status === FamilyRelationshipRequestStatus.APPROVED) {
    await diagnostics.info(MODULE_KEY, "Family relationship request approved.", {
      requesterUserId: result.requesterUserId,
      targetUserId: result.requestTargetUserId,
      relationshipLabel: result.relationshipLabel
    });
  }

  return { ok: true as const, status: result.status };
}

export async function removeSocialRelationship(fromUserId: string, input: unknown) {
  const parsed = removeRelationshipSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid relationship." };
  }

  await serializableSocialTransaction(async (tx) => {
    const reciprocal =
      parsed.data.type === SocialRelationshipType.FRIEND ||
      parsed.data.type === SocialRelationshipType.FAMILY;

    await tx.socialRelationship.deleteMany({
      where: reciprocal
        ? {
            type: parsed.data.type,
            OR: [
              { fromUserId, toUserId: parsed.data.toUserId },
              { fromUserId: parsed.data.toUserId, toUserId: fromUserId }
            ]
          }
        : {
            fromUserId,
            toUserId: parsed.data.toUserId,
            type: parsed.data.type
          }
    });

    if (reciprocal) {
      const now = new Date();
      const pairWhere = {
        OR: [
          { requesterUserId: fromUserId, targetUserId: parsed.data.toUserId },
          { requesterUserId: parsed.data.toUserId, targetUserId: fromUserId }
        ]
      };
      const pendingRequests =
        parsed.data.type === SocialRelationshipType.FRIEND
          ? await tx.friendRelationshipRequest.findMany({
              where: { status: FriendRelationshipRequestStatus.PENDING, ...pairWhere },
              select: { notificationId: true, alertId: true }
            })
          : await tx.familyRelationshipRequest.findMany({
              where: { status: FamilyRelationshipRequestStatus.PENDING, ...pairWhere },
              select: { notificationId: true, alertId: true }
            });

      if (parsed.data.type === SocialRelationshipType.FRIEND) {
        await tx.friendRelationshipRequest.updateMany({
          where: { status: FriendRelationshipRequestStatus.PENDING, ...pairWhere },
          data: { status: FriendRelationshipRequestStatus.CANCELED, respondedAt: now }
        });
      } else {
        await tx.familyRelationshipRequest.updateMany({
          where: { status: FamilyRelationshipRequestStatus.PENDING, ...pairWhere },
          data: { status: FamilyRelationshipRequestStatus.CANCELED, respondedAt: now }
        });
      }

      const notificationIds = pendingRequests
        .map((request) => request.notificationId)
        .filter((id): id is string => Boolean(id));
      const alertIds = pendingRequests
        .map((request) => request.alertId)
        .filter((id): id is string => Boolean(id));

      if (notificationIds.length > 0) {
        await tx.notification.deleteMany({ where: { id: { in: notificationIds } } });
      }

      if (alertIds.length > 0) {
        await tx.alert.deleteMany({ where: { id: { in: alertIds } } });
      }
    }

    if (parsed.data.type === SocialRelationshipType.BLOCK) {
      const now = new Date();
      const pairWhere = {
        OR: [
          { requesterUserId: fromUserId, targetUserId: parsed.data.toUserId },
          { requesterUserId: parsed.data.toUserId, targetUserId: fromUserId }
        ]
      };
      const [friendRequests, familyRequests] = await Promise.all([
        tx.friendRelationshipRequest.findMany({
          where: { status: FriendRelationshipRequestStatus.PENDING, ...pairWhere },
          select: { notificationId: true, alertId: true }
        }),
        tx.familyRelationshipRequest.findMany({
          where: { status: FamilyRelationshipRequestStatus.PENDING, ...pairWhere },
          select: { notificationId: true, alertId: true }
        })
      ]);

      await tx.socialRelationship.deleteMany({
        where: {
          type: { not: SocialRelationshipType.BLOCK },
          OR: [
            { fromUserId, toUserId: parsed.data.toUserId },
            { fromUserId: parsed.data.toUserId, toUserId: fromUserId }
          ]
        }
      });

      await tx.friendRelationshipRequest.updateMany({
        where: { status: FriendRelationshipRequestStatus.PENDING, ...pairWhere },
        data: { status: FriendRelationshipRequestStatus.CANCELED, respondedAt: now }
      });
      await tx.familyRelationshipRequest.updateMany({
        where: { status: FamilyRelationshipRequestStatus.PENDING, ...pairWhere },
        data: { status: FamilyRelationshipRequestStatus.CANCELED, respondedAt: now }
      });

      const notificationIds = [...friendRequests, ...familyRequests]
        .map((request) => request.notificationId)
        .filter((id): id is string => Boolean(id));
      const alertIds = [...friendRequests, ...familyRequests]
        .map((request) => request.alertId)
        .filter((id): id is string => Boolean(id));

      if (notificationIds.length > 0) {
        await tx.notification.deleteMany({ where: { id: { in: notificationIds } } });
      }

      if (alertIds.length > 0) {
        await tx.alert.deleteMany({ where: { id: { in: alertIds } } });
      }
    }
  });

  return { ok: true as const };
}

export async function listApprovedFamilyMembers(userId: string): Promise<FamilyMemberView[]> {
  const family = await withSocialDbTimeout(
    prisma.socialRelationship.findMany({
      where: {
        fromUserId: userId,
        fromUser: {
          is: { deactivatedAt: null }
        },
        toUser: {
          is: unblockedUserWhere(userId)
        },
        AND: [relationshipTypeScope(userId, [SocialRelationshipType.FAMILY])]
      },
      include: {
        toUser: {
          include: {
            profile: true
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    }),
    "family member lookup"
  );
  const avatarThumbnails = await resolvePreferredThumbnailUrls(family.map((relationship) => relationship.toUser.profile?.avatarUrl));

  return family
    .map((relationship) => ({
      id: relationship.toUser.id,
      username: relationship.toUser.username,
      displayName: relationship.toUser.profile?.displayName ?? relationship.toUser.username,
      avatarUrl: avatarThumbnails.get(relationship.toUser.profile?.avatarUrl ?? "") ?? relationship.toUser.profile?.avatarUrl,
      relationshipLabel: relationship.note ?? "Family"
    }))
    .sort((a, b) => {
      if (a.relationshipLabel === "Spouse" && b.relationshipLabel !== "Spouse") return -1;
      if (b.relationshipLabel === "Spouse" && a.relationshipLabel !== "Spouse") return 1;
      return a.displayName.localeCompare(b.displayName);
    });
}

export async function listPeopleCards(userId: string, type?: SocialRelationshipType): Promise<PeopleCardView[]> {
  const requestedTypes = type ? (PEOPLE_RELATIONSHIP_TYPES.includes(type) ? [type] : []) : PEOPLE_RELATIONSHIP_TYPES;
  if (requestedTypes.length === 0) return [];

  const relationships = await withSocialDbTimeout(
    prisma.socialRelationship.findMany({
      where: {
        fromUserId: userId,
        fromUser: {
          is: { deactivatedAt: null }
        },
        toUser: {
          is: unblockedUserWhere(userId)
        },
        AND: [relationshipTypeScope(userId, requestedTypes)]
      },
      include: {
        toUser: {
          include: {
            profile: true
          }
        }
      },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }]
    }),
    "people card lookup"
  );

  const grouped = new Map<string, PeopleCardView>();
  const avatarThumbnails = await resolvePreferredThumbnailUrls(relationships.map((relationship) => relationship.toUser.profile?.avatarUrl));

  for (const relationship of relationships) {
    const existing = grouped.get(relationship.toUserId);
    const displayName = relationship.toUser.profile?.displayName ?? relationship.toUser.username;
    const card =
      existing ??
      ({
        id: relationship.toUser.id,
        username: relationship.toUser.username,
        displayName,
        fullName: displayName,
        avatarUrl: avatarThumbnails.get(relationship.toUser.profile?.avatarUrl ?? "") ?? relationship.toUser.profile?.avatarUrl,
        location: relationship.toUser.profile?.location,
        relationships: [],
        familyLabel: relationship.type === SocialRelationshipType.FAMILY ? relationship.note : null
      } satisfies PeopleCardView);

    card.relationships.push(relationship.type);
    if (relationship.type === SocialRelationshipType.FAMILY) {
      card.familyLabel = relationship.note;
    }
    grouped.set(relationship.toUserId, card);
  }

  return Array.from(grouped.values());
}

export async function safeListPeopleCards(userId: string, type?: SocialRelationshipType) {
  try {
    return await listPeopleCards(userId, type);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list people cards.", {
      userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function browsePeopleCards(userId: string, rawQuery?: string | null): Promise<PeopleCardView[]> {
  const query = rawQuery?.trim() ?? "";
  const viewer = await prisma.user.findFirst({
    where: { id: userId, deactivatedAt: null },
    select: { role: true }
  });

  if (!viewer) return [];

  const people = await withSocialDbTimeout(
    prisma.user.findMany({
      where: {
        id: { not: userId },
        AND: [
          unblockedUserWhere(userId),
          isAdminRole(viewer?.role)
            ? {}
            : {
                profile: {
                  is: {
                    visibility: {
                      in: [ProfileVisibility.MEMBERS, ProfileVisibility.PUBLIC]
                    }
                  }
                }
              },
          query.length >= 2
            ? {
                OR: [
                  { username: { contains: query, mode: "insensitive" } },
                  {
                    email: {
                      contains: query,
                      mode: "insensitive"
                    }
                  },
                  {
                    profile: {
                      is: {
                        OR: [
                          { displayName: { contains: query, mode: "insensitive" } },
                          { tagline: { contains: query, mode: "insensitive" } },
                          { bio: { contains: query, mode: "insensitive" } },
                          { location: { contains: query, mode: "insensitive" } }
                        ]
                      }
                    }
                  }
                ]
              }
            : {}
        ]
      },
      include: {
        profile: true
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 48
    }),
    "people browse lookup"
  );
  const relationships = await prisma.socialRelationship.findMany({
    where: {
      fromUserId: userId,
      toUserId: {
        in: people.map((person) => person.id)
      },
      type: {
        in: PEOPLE_RELATIONSHIP_TYPES
      },
      AND: [relationshipTypeScope(userId, PEOPLE_RELATIONSHIP_TYPES)]
    },
    select: {
      toUserId: true,
      type: true,
      note: true
    }
  });
  const pendingFamilyRequests = await prisma.familyRelationshipRequest.findMany({
    where: {
      requesterUserId: userId,
      targetUserId: {
        in: people.map((person) => person.id)
      },
      status: FamilyRelationshipRequestStatus.PENDING
    },
    select: {
      targetUserId: true
    }
  });
  const pendingFriendRequests = await prisma.friendRelationshipRequest.findMany({
    where: {
      requesterUserId: userId,
      targetUserId: {
        in: people.map((person) => person.id)
      },
      status: FriendRelationshipRequestStatus.PENDING
    },
    select: {
      targetUserId: true
    }
  });
  const relationshipMap = new Map<string, SocialRelationshipType[]>();
  const familyLabelMap = new Map<string, string>();
  const avatarThumbnails = await resolvePreferredThumbnailUrls(people.map((person) => person.profile?.avatarUrl));
  const pendingFamilyRequestIds = new Set(pendingFamilyRequests.map((request) => request.targetUserId));
  const pendingFriendRequestIds = new Set(pendingFriendRequests.map((request) => request.targetUserId));

  for (const relationship of relationships) {
    const current = relationshipMap.get(relationship.toUserId) ?? [];
    current.push(relationship.type);
    relationshipMap.set(relationship.toUserId, current);
    if (relationship.type === SocialRelationshipType.FAMILY && relationship.note) {
      familyLabelMap.set(relationship.toUserId, relationship.note);
    }
  }

  return people.map((person) => {
    const displayName = person.profile?.displayName ?? person.username;

    return {
      id: person.id,
      username: person.username,
      displayName,
      fullName: displayName,
      avatarUrl: avatarThumbnails.get(person.profile?.avatarUrl ?? "") ?? person.profile?.avatarUrl,
      location: person.profile?.location,
      relationships: relationshipMap.get(person.id) ?? [],
      familyLabel: familyLabelMap.get(person.id) ?? null,
      pendingFamilyRequest: pendingFamilyRequestIds.has(person.id),
      pendingFriendRequest: pendingFriendRequestIds.has(person.id)
    };
  });
}

export async function safeBrowsePeopleCards(userId: string, query?: string | null) {
  try {
    return await browsePeopleCards(userId, query);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not browse people cards.", {
      userId,
      query,
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}
