import { ProfileVisibility } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { updateProfileSchema, type ProfileCardView } from "@/modules/profile-identity/types";
import { listApprovedFamilyMembers } from "@/modules/social-graph/social-graph.service";

const MODULE_KEY = "profile-identity";
const PROFILE_DB_TIMEOUT_MS = 2500;

function withProfileDbTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timed out`)), PROFILE_DB_TIMEOUT_MS);
    })
  ]);
}

function toProfileCard(user: {
  id: string;
  username: string;
  role: string;
  profile: {
    displayName: string | null;
    tagline: string | null;
    bio: string | null;
    avatarUrl: string | null;
    bannerUrl: string | null;
    location: string | null;
    visibility: ProfileVisibility;
  } | null;
  membership: { tier: string } | null;
}, familyMembers: ProfileCardView["familyMembers"] = []): ProfileCardView {
  return {
    username: user.username,
    displayName: user.profile?.displayName ?? user.username,
    tagline: user.profile?.tagline,
    bio: user.profile?.bio,
    avatarUrl: user.profile?.avatarUrl,
    bannerUrl: user.profile?.bannerUrl,
    location: user.profile?.location,
    visibility: user.profile?.visibility ?? ProfileVisibility.MEMBERS,
    tier: user.membership?.tier ?? "FREE",
    role: user.role,
    familyMembers
  };
}

export async function getPublicProfileByUsername(username: string) {
  try {
    const user = await withProfileDbTimeout(
      prisma.user.findUnique({
        where: { username: username.trim().replace(/^@/, "").toLowerCase() },
        include: {
          profile: true,
          membership: true
        }
      }),
      "public profile lookup"
    );

    if (!user || user.deactivatedAt) return null;

    const familyMembers = await listApprovedFamilyMembers(user.id);
    return toProfileCard(user, familyMembers);
  } catch (error) {
    await diagnostics.error(MODULE_KEY, "Could not load public profile.", {
      username,
      error: error instanceof Error ? error.message : "unknown"
    });
    return null;
  }
}

export async function getProfileForOwner(userId: string) {
  const user = await withProfileDbTimeout(
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        membership: true
      }
    }),
    "owner profile lookup"
  );

  if (!user) return null;
  const familyMembers = await listApprovedFamilyMembers(user.id);
  return toProfileCard(user, familyMembers);
}

export async function updateProfileIdentity(userId: string, input: unknown) {
  const parsed = updateProfileSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid profile." };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return { ok: false as const, error: "User was not found." };
  }

  const profile = await prisma.profile.upsert({
    where: { userId },
    update: {
      displayName: parsed.data.displayName,
      tagline: parsed.data.tagline || null,
      bio: parsed.data.bio || null,
      location: parsed.data.location || null,
      avatarUrl: parsed.data.avatarUrl || null,
      bannerUrl: parsed.data.bannerUrl || null,
      visibility: parsed.data.visibility
    },
    create: {
      userId,
      displayName: parsed.data.displayName,
      tagline: parsed.data.tagline || null,
      bio: parsed.data.bio || null,
      location: parsed.data.location || null,
      avatarUrl: parsed.data.avatarUrl || null,
      bannerUrl: parsed.data.bannerUrl || null,
      visibility: parsed.data.visibility
    }
  });

  await diagnostics.info(MODULE_KEY, "Profile identity updated.", {
    userId,
    visibility: profile.visibility
  });

  return { ok: true as const, profile };
}
