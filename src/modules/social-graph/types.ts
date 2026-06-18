import { SocialRelationshipType } from "@prisma/client";
import { z } from "zod";

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
  avatarUrl?: string | null;
  location?: string | null;
  relationships: SocialRelationshipType[];
};
