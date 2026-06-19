import { FamilyRelationshipRequestStatus, ProfileVisibility, SocialRelationshipType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
  familyRelationshipRequestSchema,
  familyRelationshipResponseSchema,
  type FamilyMemberView,
  type PeopleCardView,
  removeRelationshipSchema,
  setRelationshipSchema
} from "@/modules/social-graph/types";

const MODULE_KEY = "social-graph";
const SOCIAL_DB_TIMEOUT_MS = 2500;

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
    Child: "Parent",
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

export async function setSocialRelationship(fromUserId: string, input: unknown) {
  const parsed = setRelationshipSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid relationship." };
  }

  if (parsed.data.toUserId === fromUserId) {
    return { ok: false as const, error: "You cannot create a relationship to yourself." };
  }

  const relationship = await prisma.socialRelationship.upsert({
    where: {
      fromUserId_toUserId_type: {
        fromUserId,
        toUserId: parsed.data.toUserId,
        type: parsed.data.type
      }
    },
    update: {
      note: parsed.data.note || null
    },
    create: {
      fromUserId,
      toUserId: parsed.data.toUserId,
      type: parsed.data.type,
      note: parsed.data.note || null
    }
  });

  await diagnostics.info(MODULE_KEY, "Social relationship set.", {
    fromUserId,
    toUserId: parsed.data.toUserId,
    type: parsed.data.type
  });

  return { ok: true as const, relationship };
}

export async function requestFamilyRelationship(requesterUserId: string, input: unknown) {
  const parsed = familyRelationshipRequestSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid family request." };
  }

  if (parsed.data.targetUserId === requesterUserId) {
    return { ok: false as const, error: "You cannot tag yourself as family." };
  }

  const [requester, target, existingFamily, pendingRequest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: requesterUserId },
      include: { profile: true }
    }),
    prisma.user.findUnique({
      where: { id: parsed.data.targetUserId },
      include: { profile: true }
    }),
    prisma.socialRelationship.findFirst({
      where: {
        fromUserId: requesterUserId,
        toUserId: parsed.data.targetUserId,
        type: SocialRelationshipType.FAMILY
      }
    }),
    prisma.familyRelationshipRequest.findFirst({
      where: {
        requesterUserId,
        targetUserId: parsed.data.targetUserId,
        status: FamilyRelationshipRequestStatus.PENDING
      }
    })
  ]);

  if (!requester || !target || target.deactivatedAt) {
    return { ok: false as const, error: "That member was not found." };
  }

  if (existingFamily) {
    return { ok: false as const, error: "That member is already tagged as family." };
  }

  if (pendingRequest) {
    return { ok: false as const, error: "A family approval request is already pending." };
  }

  const requesterName = requester.profile?.displayName ?? requester.username;
  const targetName = target.profile?.displayName ?? target.username;
  const request = await prisma.familyRelationshipRequest.create({
    data: {
      requesterUserId,
      targetUserId: target.id,
      relationshipLabel: parsed.data.relationshipLabel,
      reciprocalLabel: reciprocalFamilyLabel(parsed.data.relationshipLabel),
      message: parsed.data.message || null
    }
  });

  const alert = await prisma.alert.create({
    data: {
      userId: target.id,
      title: "Family tag approval needed",
      body: `${requesterName} wants to list you as ${parsed.data.relationshipLabel} on their profile. Approve only if this is correct.`,
      href: `/alerts?familyRequestId=${request.id}`
    }
  });

  await prisma.familyRelationshipRequest.update({
    where: { id: request.id },
    data: { alertId: alert.id }
  });

  await diagnostics.info(MODULE_KEY, "Family relationship request created.", {
    requesterUserId,
    targetUserId: target.id,
    relationshipLabel: parsed.data.relationshipLabel
  });

  return {
    ok: true as const,
    request: {
      id: request.id,
      targetName,
      relationshipLabel: parsed.data.relationshipLabel
    }
  };
}

export async function respondToFamilyRelationshipRequest(targetUserId: string, requestId: string, input: unknown) {
  const parsed = familyRelationshipResponseSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid response." };
  }

  const request = await prisma.familyRelationshipRequest.findFirst({
    where: {
      id: requestId,
      targetUserId,
      status: FamilyRelationshipRequestStatus.PENDING
    },
    include: {
      requester: { include: { profile: true } },
      target: { include: { profile: true } }
    }
  });

  if (!request) {
    return { ok: false as const, error: "That family request was not found or is no longer pending." };
  }

  const now = new Date();

  if (parsed.data.action === "deny") {
    await prisma.$transaction([
      prisma.familyRelationshipRequest.update({
        where: { id: request.id },
        data: {
          status: FamilyRelationshipRequestStatus.DENIED,
          respondedAt: now
        }
      }),
      ...(request.alertId
        ? [
            prisma.alert.updateMany({
              where: { id: request.alertId, userId: targetUserId },
              data: {
                readAt: now,
                body: `Denied family tag request from ${request.requester.profile?.displayName ?? request.requester.username}.`
              }
            })
          ]
        : []),
      prisma.alert.create({
        data: {
          userId: request.requesterUserId,
          title: "Family tag request denied",
          body: `${request.target.profile?.displayName ?? request.target.username} did not approve the family tag request.`,
          href: `/profile/${request.target.username}`
        }
      })
    ]);

    return { ok: true as const, status: FamilyRelationshipRequestStatus.DENIED };
  }

  await prisma.$transaction([
    prisma.socialRelationship.upsert({
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
    }),
    prisma.socialRelationship.upsert({
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
    }),
    prisma.familyRelationshipRequest.update({
      where: { id: request.id },
      data: {
        status: FamilyRelationshipRequestStatus.APPROVED,
        respondedAt: now
      }
    }),
    ...(request.alertId
      ? [
          prisma.alert.updateMany({
            where: { id: request.alertId, userId: targetUserId },
            data: {
              readAt: now,
              body: `Approved family tag request from ${request.requester.profile?.displayName ?? request.requester.username}.`
            }
          })
        ]
      : []),
    prisma.alert.create({
      data: {
        userId: request.requesterUserId,
        title: "Family tag approved",
        body: `${request.target.profile?.displayName ?? request.target.username} approved your family tag request.`,
        href: `/profile/${request.requester.username}`
      }
    })
  ]);

  await diagnostics.info(MODULE_KEY, "Family relationship request approved.", {
    requesterUserId: request.requesterUserId,
    targetUserId: request.targetUserId,
    relationshipLabel: request.relationshipLabel
  });

  return { ok: true as const, status: FamilyRelationshipRequestStatus.APPROVED };
}

export async function removeSocialRelationship(fromUserId: string, input: unknown) {
  const parsed = removeRelationshipSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid relationship." };
  }

  await prisma.socialRelationship.deleteMany({
    where: {
      fromUserId,
      toUserId: parsed.data.toUserId,
      type: parsed.data.type
    }
  });

  return { ok: true as const };
}

export async function listApprovedFamilyMembers(userId: string): Promise<FamilyMemberView[]> {
  const family = await withSocialDbTimeout(
    prisma.socialRelationship.findMany({
      where: {
        fromUserId: userId,
        type: SocialRelationshipType.FAMILY
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

  return family.map((relationship) => ({
    id: relationship.toUser.id,
    username: relationship.toUser.username,
    displayName: relationship.toUser.profile?.displayName ?? relationship.toUser.username,
    avatarUrl: relationship.toUser.profile?.avatarUrl,
    relationshipLabel: relationship.note ?? "Family"
  }));
}

export async function listPeopleCards(userId: string, type?: SocialRelationshipType): Promise<PeopleCardView[]> {
  const relationships = await withSocialDbTimeout(
    prisma.socialRelationship.findMany({
      where: {
        fromUserId: userId,
        type: type ? type : { in: [SocialRelationshipType.FRIEND, SocialRelationshipType.FAMILY, SocialRelationshipType.CONTACT] }
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
        avatarUrl: relationship.toUser.profile?.avatarUrl,
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
  const [viewer, blockedRelationships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    }),
    prisma.socialRelationship.findMany({
      where: {
        type: SocialRelationshipType.BLOCK,
        OR: [{ fromUserId: userId }, { toUserId: userId }]
      },
      select: {
        fromUserId: true,
        toUserId: true
      }
    })
  ]);
  const blockedUserIds = blockedRelationships.map((relationship) =>
    relationship.fromUserId === userId ? relationship.toUserId : relationship.fromUserId
  );

  const people = await withSocialDbTimeout(
    prisma.user.findMany({
      where: {
        deactivatedAt: null,
        id: {
          notIn: [userId, ...blockedUserIds]
        },
        AND: [
          viewer?.role === UserRole.ADMIN
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
        in: [SocialRelationshipType.FRIEND, SocialRelationshipType.FAMILY, SocialRelationshipType.CONTACT]
      }
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
  const relationshipMap = new Map<string, SocialRelationshipType[]>();
  const familyLabelMap = new Map<string, string>();
  const pendingFamilyRequestIds = new Set(pendingFamilyRequests.map((request) => request.targetUserId));

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
      avatarUrl: person.profile?.avatarUrl,
      location: person.profile?.location,
      relationships: relationshipMap.get(person.id) ?? [],
      familyLabel: familyLabelMap.get(person.id) ?? null,
      pendingFamilyRequest: pendingFamilyRequestIds.has(person.id)
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
