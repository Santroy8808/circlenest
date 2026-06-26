import { BusinessProfileKind, MembershipTier, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";

export const ACCOUNT_ACTOR_COOKIE_NAME = "theta_active_actor_user_id";

export type AccountActorKind = "PERSONAL" | "BUSINESS";

export type AccountActorView = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  kind: AccountActorKind;
  businessProfileId?: string;
  businessSlug?: string;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

async function uniqueUsername(name: string) {
  const base = slugify(name) || "business";
  let candidate = base;
  let index = 2;

  while (await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } })) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

async function uniqueBusinessEmail(username: string) {
  let candidate = `business+${username}@theta-space.local`;
  let index = 2;

  while (await prisma.user.findUnique({ where: { email: candidate }, select: { id: true } })) {
    candidate = `business+${username}-${index}@theta-space.local`;
    index += 1;
  }

  return candidate;
}

function actorView(input: {
  user: {
    id: string;
    username: string;
    profile: { displayName: string | null; avatarUrl: string | null } | null;
    businessProfile?: { id: string; slug: string } | null;
  };
  kind: AccountActorKind;
}): AccountActorView {
  return {
    userId: input.user.id,
    username: input.user.username,
    displayName: profileName(input.user),
    avatarUrl: input.user.profile?.avatarUrl ?? null,
    kind: input.kind,
    businessProfileId: input.user.businessProfile?.id,
    businessSlug: input.user.businessProfile?.slug
  };
}

export async function listAccountActors(privateUserId: string): Promise<AccountActorView[]> {
  const user = await prisma.user.findUnique({
    where: { id: privateUserId },
    include: {
      profile: true,
      privateBusinessAccounts: {
        where: { active: true },
        include: {
          businessUser: {
            include: {
              profile: true,
              businessProfile: {
                select: {
                  id: true,
                  slug: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!user) return [];

  return [
    actorView({ user, kind: "PERSONAL" }),
    ...user.privateBusinessAccounts.map((account) => actorView({ user: account.businessUser, kind: "BUSINESS" }))
  ];
}

export async function resolveAccountActorUserId(privateUserId: string, requestedActorUserId?: string | null) {
  if (!requestedActorUserId || requestedActorUserId === privateUserId) {
    return { ok: true as const, actorUserId: privateUserId, kind: "PERSONAL" as const };
  }

  const account = await prisma.businessAccount.findFirst({
    where: {
      privateUserId,
      businessUserId: requestedActorUserId,
      active: true
    },
    select: {
      businessUserId: true
    }
  });

  if (!account) {
    return { ok: false as const, error: "That account cannot be used from this login." };
  }

  return { ok: true as const, actorUserId: account.businessUserId, kind: "BUSINESS" as const };
}

export async function getBusinessAccountForOwner(privateUserId: string) {
  return prisma.businessAccount.findFirst({
    where: {
      privateUserId,
      active: true
    },
    include: {
      businessUser: {
        include: {
          profile: true,
          businessProfile: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
}

export async function ensureBusinessAccountForOwner(
  privateUserId: string,
  seed: {
    businessName: string;
    tagline?: string | null;
    logoUrl?: string | null;
    bannerUrl?: string | null;
  }
) {
  const existing = await getBusinessAccountForOwner(privateUserId);

  if (existing) {
    return existing;
  }

  const [privateUser, legacyProfile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: privateUserId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        membership: {
          select: {
            tier: true
          }
        }
      }
    }),
    prisma.businessProfile.findUnique({
      where: { ownerUserId: privateUserId }
    })
  ]);

  if (!privateUser) {
    throw new Error("Private account was not found.");
  }

  const businessName = seed.businessName || legacyProfile?.businessName || `${privateUser.username} business`;
  const username = await uniqueUsername(businessName);
  const email = await uniqueBusinessEmail(username);
  const profileKind = privateUser.membership?.tier === MembershipTier.ORG ? BusinessProfileKind.ORG : BusinessProfileKind.BUSINESS;

  const account = await prisma.$transaction(async (tx) => {
    const businessUser = await tx.user.create({
      data: {
        email,
        username,
        role: UserRole.MEMBER,
        emailVerified: new Date(),
        membership: {
          create: {
            tier: MembershipTier.FREE
          }
        },
        profile: {
          create: {
            displayName: businessName,
            tagline: seed.tagline || legacyProfile?.tagline || null,
            avatarUrl: seed.logoUrl || legacyProfile?.logoUrl || null,
            bannerUrl: seed.bannerUrl || legacyProfile?.bannerUrl || null
          }
        }
      }
    });

    if (legacyProfile) {
      await tx.businessProfile.update({
        where: { id: legacyProfile.id },
        data: {
          ownerUserId: businessUser.id,
          profileKind,
          businessName,
          tagline: seed.tagline ?? legacyProfile.tagline,
          logoUrl: seed.logoUrl ?? legacyProfile.logoUrl,
          bannerUrl: seed.bannerUrl ?? legacyProfile.bannerUrl
        }
      });
      await tx.businessArticle.updateMany({
        where: { businessProfileId: legacyProfile.id },
        data: { ownerUserId: businessUser.id }
      });
    }

    if (!legacyProfile) {
      await tx.businessProfile.create({
        data: {
          ownerUserId: businessUser.id,
          profileKind,
          slug: username,
          businessName,
          tagline: seed.tagline || null,
          logoUrl: seed.logoUrl || null,
          bannerUrl: seed.bannerUrl || null
        }
      });
    }

    return tx.businessAccount.create({
      data: {
        privateUserId,
        businessUserId: businessUser.id
      },
      include: {
        businessUser: {
          include: {
            profile: true,
            businessProfile: true
          }
        }
      }
    });
  });

  return account;
}
