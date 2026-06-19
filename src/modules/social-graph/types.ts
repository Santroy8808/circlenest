import { SocialRelationshipType } from "@prisma/client";
import { z } from "zod";

export const familyRelationshipLabels = [
  "Spouse",
  "Parent",
  "Child",
  "Sibling",
  "Grandparent",
  "Grandchild",
  "Aunt/Uncle",
  "Niece/Nephew",
  "Cousin",
  "In-law",
  "Other family"
] as const;

export const familyRelationshipRequestSchema = z.object({
  targetUserId: z.string().min(1),
  relationshipLabel: z.enum(familyRelationshipLabels),
  message: z.string().max(240).optional().or(z.literal(""))
});

export const familyRelationshipResponseSchema = z.object({
  action: z.enum(["approve", "deny"])
});

export const setRelationshipSchema = z.object({
  toUserId: z.string().min(1),
  type: z.nativeEnum(SocialRelationshipType),
  note: z.string().max(240).optional().or(z.literal(""))
});

export const removeRelationshipSchema = z.object({
  toUserId: z.string().min(1),
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
};

export type FamilyMemberView = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  relationshipLabel: string;
};
