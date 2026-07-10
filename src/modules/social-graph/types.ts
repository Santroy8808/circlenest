import { SocialRelationshipType } from "@prisma/client";
import { z } from "zod";
import { cuidIdSchema } from "@/lib/platform/validation";

export const familyRelationshipLabels = [
  "Spouse",
  "Parent",
  "Progeny",
  "Child",
  "Sibling",
  "Family",
  "Grandparent",
  "Grandchild",
  "Aunt/Uncle",
  "Niece/Nephew",
  "Cousin",
  "In-law",
  "Other family"
] as const;

export const quickFamilyRelationshipLabels = ["Spouse", "Sibling", "Cousin", "Family", "Parent", "Progeny"] as const;

export const familyRelationshipRequestSchema = z.object({
  targetUserId: cuidIdSchema,
  relationshipLabel: z.enum(familyRelationshipLabels),
  message: z.string().trim().max(240).optional().or(z.literal(""))
});

export const friendRelationshipRequestSchema = z.object({
  targetUserId: cuidIdSchema,
  message: z.string().trim().max(240).optional().or(z.literal(""))
});

export const familyRelationshipResponseSchema = z.object({
  action: z.enum(["approve", "deny"])
});

export const friendRelationshipResponseSchema = z.object({
  action: z.enum(["approve", "deny"])
});

export const setRelationshipSchema = z.object({
  toUserId: cuidIdSchema,
  type: z.nativeEnum(SocialRelationshipType),
  note: z.string().trim().max(240).optional().or(z.literal(""))
});

export const removeRelationshipSchema = z.object({
  toUserId: cuidIdSchema,
  type: z.nativeEnum(SocialRelationshipType)
});

export type PeopleCardView = {
  id: string;
  username: string;
  displayName: string;
  fullName: string;
  avatarUrl?: string | null;
  location?: string | null;
  relationships: SocialRelationshipType[];
  familyLabel?: string | null;
  pendingFamilyRequest?: boolean;
  pendingFriendRequest?: boolean;
};

export type FamilyMemberView = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  relationshipLabel: string;
};
