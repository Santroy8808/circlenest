import { FamilyRelationshipRequestStatus, FriendRelationshipRequestStatus, ProfileVisibility, ScientologyVisibility, SocialRelationshipType } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { diagnostics } from "@/lib/platform/logging";
import { setProfileMediaSchema, updateProfileSchema, type ProfileCardView } from "@/modules/profile-identity/types";
import { listApprovedFamilyMembers } from "@/modules/social-graph/social-graph.service";

const MODULE_KEY = "profile-identity";
const PROFILE_DB_TIMEOUT_MS = 2500;
type ProfileMediaMetadata = {
  thumbnailUrl?: string | null;
};

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
    allowProfilePosts: boolean;
  } | null;
  membership: { tier: string } | null;
  resume?: { visibility: ProfileVisibility } | null;
  scientologyProfile?: { visibility: ScientologyVisibility } | null;
}, familyMembers: ProfileCardView["familyMembers"] = []): ProfileCardView {
  return {
    id: user.id,
    username: user.username,
    displayName: user.profile?.displayName ?? user.username,
    tagline: user.profile?.tagline,
    bio: user.profile?.bio,
    avatarUrl: user.profile?.avatarUrl,
    bannerUrl: user.profile?.bannerUrl,
    location: user.profile?.location,
    visibility: user.profile?.visibility ?? ProfileVisibility.MEMBERS,
    allowProfilePosts: user.profile?.allowProfilePosts ?? true,
    tier: user.membership?.tier ?? "FREE",
    role: user.role,
    familyMembers,
    viewerRelationships: [],
    pendingFriendRequest: false,
    pendingFamilyRequest: false,
    scientologyVisible: user.scientologyProfile?.visibility === ScientologyVisibility.MEMBERS,
    resumeVisible: Boolean(user.resume && user.resume.visibility !== ProfileVisibility.PRIVATE)
  };
}

async function getViewerRelationshipState(viewerUserId: string | undefined, targetUserId: string) {
  if (!viewerUserId || viewerUserId === targetUserId) {
    return { viewerRelationships: [] as SocialRelationshipType[], pendingFamilyRequest: false };
  }

  const [relationships, pendingFriendRequest, pendingFamilyRequest] = await Promise.all([
    prisma.socialRelationship.findMany({
      where: {
        fromUserId: viewerUserId,
        toUserId: targetUserId,
        type: {
          in: [SocialRelationshipType.FRIEND, SocialRelationshipType.FAMILY, SocialRelationshipType.ACQUAINTANCE, SocialRelationshipType.CONTACT]
        }
      },
      select: { type: true }
    }),
    prisma.friendRelationshipRequest.findFirst({
      where: {
        requesterUserId: viewerUserId,
        targetUserId,
        status: FriendRelationshipRequestStatus.PENDING
      },
      select: { id: true }
    }),
    prisma.familyRelationshipRequest.findFirst({
      where: {
        requesterUserId: viewerUserId,
        targetUserId,
        status: FamilyRelationshipRequestStatus.PENDING
      },
      select: { id: true }
    })
  ]);

  return {
    viewerRelationships: relationships.map((relationship) => relationship.type),
    pendingFriendRequest: Boolean(pendingFriendRequest),
    pendingFamilyRequest: Boolean(pendingFamilyRequest)
  };
}

export async function getPublicProfileByUsername(username: string, viewerUserId?: string) {
  try {
    const user = await withProfileDbTimeout(
      prisma.user.findUnique({
        where: { username: username.trim().replace(/^@/, "").toLowerCase() },
        include: {
          profile: true,
          membership: true,
          resume: {
            select: {
              visibility: true
            }
          },
          scientologyProfile: {
            select: {
              visibility: true
            }
          }
        }
      }),
      "public profile lookup"
    );

    if (!user || user.deactivatedAt) return null;

    const [familyMembers, relationshipState] = await Promise.all([
      listApprovedFamilyMembers(user.id),
      getViewerRelationshipState(viewerUserId, user.id)
    ]);
    const isOwner = viewerUserId === user.id;
    return {
      ...toProfileCard(user, familyMembers),
      ...relationshipState,
      scientologyVisible: isOwner || user.scientologyProfile?.visibility === ScientologyVisibility.MEMBERS,
      resumeVisible: Boolean(user.resume && (isOwner || user.resume.visibility !== ProfileVisibility.PRIVATE))
    };
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
        membership: true,
        resume: {
          select: {
            visibility: true
          }
        },
        scientologyProfile: {
          select: {
            visibility: true
          }
        }
      }
    }),
    "owner profile lookup"
  );

  if (!user) return null;
  const familyMembers = await listApprovedFamilyMembers(user.id);
  const profile = toProfileCard(user, familyMembers);
  return {
    ...profile,
    scientologyVisible: Boolean(user.scientologyProfile),
    resumeVisible: Boolean(user.resume)
  };
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
      visibility: parsed.data.visibility,
      allowProfilePosts: parsed.data.allowProfilePosts
    },
    create: {
      userId,
      displayName: parsed.data.displayName,
      tagline: parsed.data.tagline || null,
      bio: parsed.data.bio || null,
      location: parsed.data.location || null,
      avatarUrl: parsed.data.avatarUrl || null,
      bannerUrl: parsed.data.bannerUrl || null,
      visibility: parsed.data.visibility,
      allowProfilePosts: parsed.data.allowProfilePosts
    }
  });

  await diagnostics.info(MODULE_KEY, "Profile identity updated.", {
    userId,
    visibility: profile.visibility
  });

  return { ok: true as const, profile };
}

export async function setProfileMediaFromGallery(userId: string, input: unknown) {
  const parsed = setProfileMediaSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid profile image." };
  }

  const [user, asset] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    }),
    prisma.mediaAsset.findFirst({
      where: {
        id: parsed.data.mediaAssetId,
        ownerUserId: userId,
        mimeType: { startsWith: "image/" }
      },
      select: {
        id: true,
        publicUrl: true,
        metadata: true
      }
    })
  ]);

  if (!user) {
    return { ok: false as const, error: "User was not found." };
  }

  if (!asset) {
    return { ok: false as const, error: "That photo was not found in My Pics." };
  }

  const metadata = asset.metadata as ProfileMediaMetadata | null;
  const originalUrl = asset.publicUrl ?? `/api/media/assets/${asset.id}`;
  const mediaUrl = parsed.data.target === "avatar" ? metadata?.thumbnailUrl ?? originalUrl : originalUrl;
  const profile = await prisma.profile.upsert({
    where: { userId },
    update: parsed.data.target === "avatar" ? { avatarUrl: mediaUrl } : { bannerUrl: mediaUrl },
    create: {
      userId,
      displayName: user.profile?.displayName ?? user.username,
      avatarUrl: parsed.data.target === "avatar" ? mediaUrl : null,
      bannerUrl: parsed.data.target === "banner" ? mediaUrl : null
    }
  });

  await diagnostics.info(MODULE_KEY, "Profile media selected from gallery.", {
    userId,
    mediaAssetId: asset.id,
    target: parsed.data.target
  });

  return { ok: true as const, profile, mediaUrl };
}
