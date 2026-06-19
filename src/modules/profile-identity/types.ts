import { ProfileVisibility } from "@prisma/client";
import { z } from "zod";
import type { FamilyMemberView } from "@/modules/social-graph/types";

export const updateProfileSchema = z.object({
  displayName: z.string().min(1, "Display name is required.").max(80),
  tagline: z.string().max(140).optional().or(z.literal("")),
  bio: z.string().max(2000).optional().or(z.literal("")),
  location: z.string().max(120).optional().or(z.literal("")),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  bannerUrl: z.string().url().optional().or(z.literal("")),
  visibility: z.nativeEnum(ProfileVisibility).default(ProfileVisibility.MEMBERS)
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
