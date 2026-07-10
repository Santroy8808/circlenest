import { ProfileVisibility } from "@prisma/client";
import type { SocialRelationshipType } from "@prisma/client";
import { z } from "zod";
import { cuidIdSchema } from "@/lib/platform/validation";
import type { FamilyMemberView } from "@/modules/social-graph/types";

export const updateProfileSchema = z.object({
  displayName: z.string().min(1, "Display name is required.").max(80),
  tagline: z.string().max(140).optional().or(z.literal("")),
  bio: z.string().max(2000).optional().or(z.literal("")),
  location: z.string().max(120).optional().or(z.literal("")),
  visibility: z.nativeEnum(ProfileVisibility).default(ProfileVisibility.MEMBERS),
  allowProfilePosts: z.boolean().default(true)
});

export const setProfileMediaSchema = z.object({
  mediaAssetId: cuidIdSchema,
  target: z.enum(["avatar", "banner"])
});

export type ProfileCardView = {
  id: string;
  username: string;
  displayName: string;
  tagline?: string | null;
  bio?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  visibility: ProfileVisibility;
  allowProfilePosts: boolean;
  tier: string;
  role: string;
  familyMembers: FamilyMemberView[];
  viewerRelationships: SocialRelationshipType[];
  pendingFriendRequest: boolean;
  pendingFamilyRequest: boolean;
  scientologyVisible: boolean;
  resumeVisible: boolean;
};
