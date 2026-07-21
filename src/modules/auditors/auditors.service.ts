import { ScientologyClassification } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { ensureAuditorAccountForOwner, getAuditorAccountForOwner } from "@/modules/business-accounts/business-accounts.service";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import { updateAuditorProfileSchema, type AuditorProfileView, type AuditorScientologySummary } from "@/modules/auditors/types";

const MODULE_KEY = "auditors";
const AUDITORS_DB_TIMEOUT_MS = 2500;

function withAuditorsDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), AUDITORS_DB_TIMEOUT_MS);
    })
  ]);
}

function profileName(user: { username: string; profile: { displayName: string | null } | null }) {
  return user.profile?.displayName ?? user.username;
}

function scientologySummary(profile?: {
  classification: ScientologyClassification;
  orgName: string | null;
  trainingLevel: string | null;
  processingStatus: string | null;
  educationNotes: string | null;
} | null): AuditorScientologySummary {
  return {
    classification: profile?.classification ?? ScientologyClassification.PUBLIC,
    orgName: profile?.orgName ?? null,
    trainingLevel: profile?.trainingLevel ?? null,
    processingStatus: profile?.processingStatus ?? null,
    educationNotes: profile?.educationNotes ?? null
  };
}

function toAuditorProfileView(input: {
  id: string;
  practiceName: string;
  location: string | null;
  willingToTravel: boolean;
  bio: string | null;
  offerings: string | null;
  phone: string | null;
  website: string | null;
  active: boolean;
  createdAt: Date;
  user: {
    username: string;
    profile: { displayName: string | null; avatarUrl: string | null } | null;
    scientologyProfile: {
      classification: ScientologyClassification;
      orgName: string | null;
      trainingLevel: string | null;
      processingStatus: string | null;
      educationNotes: string | null;
    } | null;
  };
}): AuditorProfileView {
  return {
    id: input.id,
    username: input.user.username,
    displayName: profileName(input.user),
    avatarUrl: input.user.profile?.avatarUrl,
    practiceName: input.practiceName,
    location: input.location,
    willingToTravel: input.willingToTravel,
    bio: input.bio,
    offerings: input.offerings,
    phone: input.phone,
    website: input.website,
    active: input.active,
    createdAt: input.createdAt.toISOString(),
    scientology: scientologySummary(input.user.scientologyProfile)
  };
}

export async function viewerCanCreateAuditorProfile(
  userId: string,
  resolveAccess: typeof canUserAccessFeature = canUserAccessFeature
) {
  return resolveAccess(userId, "auditors.createProfile");
}

export async function listAuditors(input?: { query?: string | null }) {
  const query = input?.query?.trim();
  const auditors = await withAuditorsDbTimeout(
    prisma.auditorProfile.findMany({
      where: {
        active: true,
        ...(query
          ? {
              OR: [
                { practiceName: { contains: query, mode: "insensitive" } },
                { location: { contains: query, mode: "insensitive" } },
                { offerings: { contains: query, mode: "insensitive" } },
                { user: { username: { contains: query, mode: "insensitive" } } },
                { user: { profile: { displayName: { contains: query, mode: "insensitive" } } } },
                { user: { scientologyProfile: { trainingLevel: { contains: query, mode: "insensitive" } } } }
              ]
            }
          : {})
      },
      include: {
        user: {
          include: {
            profile: true,
            scientologyProfile: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 80
    }),
    "auditor directory lookup"
  );

  return auditors.map(toAuditorProfileView);
}

export async function safeListAuditors(input?: { query?: string | null }) {
  try {
    return await listAuditors(input);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not list auditors.", {
      error: error instanceof Error ? error.message : "unknown"
    });
    return [];
  }
}

export async function getMyAuditorProfile(userId: string) {
  const [access, user, linkedAccount] = await Promise.all([
    viewerCanCreateAuditorProfile(userId),
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        scientologyProfile: true,
        auditorProfile: true
      }
    }),
    getAuditorAccountForOwner(userId)
  ]);
  let account = linkedAccount;

  if (access.allowed && !account && user?.auditorProfile) {
    account = await ensureAuditorAccountForOwner(userId, {
      practiceName: user.auditorProfile.practiceName,
      location: user.auditorProfile.location
    });
  }
  const auditorUser = account?.auditorUser;

  return {
    canCreate: access.allowed,
    reason: access.allowed ? undefined : access.reason,
    profile:
      auditorUser?.auditorProfile && auditorUser
        ? toAuditorProfileView({
            ...auditorUser.auditorProfile,
            user: auditorUser
          })
        : null,
    scientology: scientologySummary(user?.scientologyProfile)
  };
}

export async function updateAuditorProfile(userId: string, input: unknown) {
  const parsed = updateAuditorProfileSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid auditor profile." };
  }

  const access = await viewerCanCreateAuditorProfile(userId);

  if (!access.allowed) {
    return { ok: false as const, error: "Auditor profile access required." };
  }

  const account = await ensureAuditorAccountForOwner(userId, {
    practiceName: parsed.data.practiceName,
    location: parsed.data.location
  });
  const auditorUserId = account.auditorUserId;
  const profile = await prisma.auditorProfile.upsert({
    where: {
      userId: auditorUserId
    },
    update: {
      practiceName: parsed.data.practiceName,
      location: parsed.data.location || null,
      willingToTravel: parsed.data.willingToTravel,
      bio: parsed.data.bio || null,
      offerings: parsed.data.offerings || null,
      phone: parsed.data.phone || null,
      website: parsed.data.website || null,
      active: parsed.data.active
    },
    create: {
      userId: auditorUserId,
      practiceName: parsed.data.practiceName,
      location: parsed.data.location || null,
      willingToTravel: parsed.data.willingToTravel,
      bio: parsed.data.bio || null,
      offerings: parsed.data.offerings || null,
      phone: parsed.data.phone || null,
      website: parsed.data.website || null,
      active: parsed.data.active
    }
  });
  await prisma.profile.upsert({
    where: { userId: auditorUserId },
    update: {
      displayName: parsed.data.practiceName,
      tagline: parsed.data.location || null
    },
    create: {
      userId: auditorUserId,
      displayName: parsed.data.practiceName,
      tagline: parsed.data.location || null
    }
  });

  await diagnostics.info(MODULE_KEY, "Auditor profile updated.", {
    userId: auditorUserId,
    privateUserId: userId,
    auditorProfileId: profile.id
  });

  return { ok: true as const, profile };
}

export async function getAuditorDetail(username: string) {
  const auditor = await prisma.auditorProfile.findFirst({
    where: {
      active: true,
      user: {
        username: {
          equals: username.replace(/^@/, ""),
          mode: "insensitive"
        }
      }
    },
    include: {
      user: {
        include: {
          profile: true,
          scientologyProfile: true
        }
      }
    }
  });

  if (!auditor) {
    return { ok: false as const, error: "Auditor not found." };
  }

  return { ok: true as const, auditor: toAuditorProfileView(auditor) };
}

export async function safeGetAuditorDetail(username: string) {
  try {
    return await getAuditorDetail(username);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load auditor detail.", {
      username,
      error: error instanceof Error ? error.message : "unknown"
    });
    return { ok: false as const, error: "Could not load auditor." };
  }
}
