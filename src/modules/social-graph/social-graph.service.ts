import { SocialRelationshipType } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import {
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
    const card =
      existing ??
      ({
        id: relationship.toUser.id,
        username: relationship.toUser.username,
        displayName: relationship.toUser.profile?.displayName ?? relationship.toUser.username,
        avatarUrl: relationship.toUser.profile?.avatarUrl,
        location: relationship.toUser.profile?.location,
        relationships: []
      } satisfies PeopleCardView);

    card.relationships.push(relationship.type);
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
