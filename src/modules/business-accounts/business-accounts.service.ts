import { BusinessProfileKind, MembershipTier, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/platform/db";

export const ACCOUNT_ACTOR_COOKIE_NAME = "theta_active_actor_user_id";

export type AccountActorKind = "PERSONAL" | "BUSINESS" | "AUDITOR";

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
    auditorProfile?: { id: string } | null;
  };
  kind: AccountActorKind;
}): AccountActorView {
  return {
    userId: input.user.id,
    username: input.user.username,
    displayName: profileName(input.user),
    avatarUrl: input.user.profile?.avatarUrl ?? null,
    kind: input.kind,
    businessProfileId: input.user.businessProfile?.id ?? input.user.auditorProfile?.id,
    businessSlug: input.user.businessProfile?.slug
  };
}

export async function listAccountActors(privateUserId: string): Promise<AccountActorView[]> {
  const user = await prisma.user.findUnique({
    where: { id: privateUserId },
    include: {
      profile: true,
      privateAuditorAccounts: {
        where: { active: true },
        include: {
          auditorUser: {
            include: {
              profile: true,
              auditorProfile: {
                select: {
                  id: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: "asc" }
      },
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
    ...user.privateAuditorAccounts.map((account) => actorView({ user: account.auditorUser, kind: "AUDITOR" })),
    ...user.privateBusinessAccounts.map((account) => actorView({ user: account.businessUser, kind: "BUSINESS" }))
  ];
}

export async function resolveAccountActorUserId(privateUserId: string, requestedActorUserId?: string | null) {
  if (!requestedActorUserId || requestedActorUserId === privateUserId) {
    return { ok: true as const, actorUserId: privateUserId, kind: "PERSONAL" as const };
  }

  const auditorAccount = await prisma.auditorAccount.findFirst({
    where: {
      privateUserId,
      auditorUserId: requestedActorUserId,
      active: true
    },
    select: {
      auditorUserId: true
    }
  });

  if (auditorAccount) {
    return { ok: true as const, actorUserId: auditorAccount.auditorUserId, kind: "AUDITOR" as const };
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

export async function getAuditorAccountForOwner(privateUserId: string) {
  return prisma.auditorAccount.findFirst({
    where: {
      privateUserId,
      active: true
    },
    include: {
      auditorUser: {
        include: {
          profile: true,
          scientologyProfile: true,
          auditorProfile: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
}

async function uniqueAccountEmail(prefix: string, username: string) {
  let candidate = `${prefix}+${username}@theta-space.local`;
  let index = 2;

  while (await prisma.user.findUnique({ where: { email: candidate }, select: { id: true } })) {
    candidate = `${prefix}+${username}-${index}@theta-space.local`;
    index += 1;
  }

  return candidate;
}

export async function ensureAuditorAccountForOwner(
  privateUserId: string,
  seed: {
    practiceName: string;
    location?: string | null;
  }
) {
  const existing = await getAuditorAccountForOwner(privateUserId);

  if (existing) {
    return existing;
  }

  const [privateUser, legacyProfile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: privateUserId },
      include: {
        profile: true,
        scientologyProfile: true
      }
    }),
    prisma.auditorProfile.findUnique({
      where: { userId: privateUserId }
    })
  ]);

  if (!privateUser) {
    throw new Error("Private account was not found.");
  }

  const practiceName = seed.practiceName || legacyProfile?.practiceName || `${privateUser.username} auditor`;
  const username = await uniqueUsername(practiceName);
  const email = await uniqueAccountEmail("auditor", username);

  return prisma.$transaction(async (tx) => {
    const auditorUser = await tx.user.create({
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
            displayName: practiceName,
            tagline: seed.location || legacyProfile?.location || privateUser.profile?.tagline || null,
            avatarUrl: privateUser.profile?.avatarUrl ?? null,
            bannerUrl: privateUser.profile?.bannerUrl ?? null
          }
        },
        ...(privateUser.scientologyProfile
          ? {
              scientologyProfile: {
                create: {
                  classification: privateUser.scientologyProfile.classification,
                  orgName: privateUser.scientologyProfile.orgName,
                  lastServiceName: privateUser.scientologyProfile.lastServiceName,
                  lastServiceAt: privateUser.scientologyProfile.lastServiceAt,
                  iasMembershipLast6: privateUser.scientologyProfile.iasMembershipLast6,
                  trainingLevel: privateUser.scientologyProfile.trainingLevel,
                  processingStatus: privateUser.scientologyProfile.processingStatus,
                  courseCompletions: privateUser.scientologyProfile.courseCompletions ?? Prisma.JsonNull,
                  introServices: privateUser.scientologyProfile.introServices ?? Prisma.JsonNull,
                  technicalCourses: privateUser.scientologyProfile.technicalCourses ?? Prisma.JsonNull,
                  specialistCourses: privateUser.scientologyProfile.specialistCourses ?? Prisma.JsonNull,
                  additionalProcessing: privateUser.scientologyProfile.additionalProcessing ?? Prisma.JsonNull,
                  goodStandingAttested: privateUser.scientologyProfile.goodStandingAttested,
                  goodStandingUpdatedAt: privateUser.scientologyProfile.goodStandingUpdatedAt,
                  educationNotes: privateUser.scientologyProfile.educationNotes,
                  visibility: privateUser.scientologyProfile.visibility
                }
              }
            }
          : {})
      }
    });

    if (legacyProfile) {
      await tx.auditorProfile.update({
        where: { id: legacyProfile.id },
        data: {
          userId: auditorUser.id,
          practiceName
        }
      });
    }

    if (!legacyProfile) {
      await tx.auditorProfile.create({
        data: {
          userId: auditorUser.id,
          practiceName,
          location: seed.location || null,
          active: true
        }
      });
    }

    return tx.auditorAccount.create({
      data: {
        privateUserId,
        auditorUserId: auditorUser.id
      },
      include: {
        auditorUser: {
          include: {
            profile: true,
            scientologyProfile: true,
            auditorProfile: true
          }
        }
      }
    });
  });
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
