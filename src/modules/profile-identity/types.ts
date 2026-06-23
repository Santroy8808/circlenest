import { ProfileVisibility } from "@prisma/client";
import { z } from "zod";
import type { FamilyMemberView } from "@/modules/social-graph/types";

const internalMediaUrlSchema = z.string().regex(/^\/api\/media\/assets\/[a-zA-Z0-9_-]+$/);
const profileMediaUrlSchema = z.string().url().or(internalMediaUrlSchema);

export const updateProfileSchema = z.object({
  displayName: z.string().min(1, "Display name is required.").max(80),
  tagline: z.string().max(140).optional().or(z.literal("")),
  bio: z.string().max(2000).optional().or(z.literal("")),
  location: z.string().max(120).optional().or(z.literal("")),
  avatarUrl: profileMediaUrlSchema.optional().or(z.literal("")),
  bannerUrl: profileMediaUrlSchema.optional().or(z.literal("")),
  visibility: z.nativeEnum(ProfileVisibility).default(ProfileVisibility.MEMBERS)
});

export const setProfileMediaSchema = z.object({
  mediaAssetId: z.string().min(1),
  target: z.enum(["avatar", "banner"])
});

export type ProfileCardView = {
  username: string;
  displayName: string;
  tagline?: string | null;
  bio?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  visibility: ProfileVisibility;
  tier: string;
  role: string;
  familyMembers: FamilyMemberView[];
};
