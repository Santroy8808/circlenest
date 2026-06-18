import { GroupJoinPolicy, GroupMemberRole, GroupVisibility } from "@prisma/client";
import { z } from "zod";

export const groupDirectoryModeSchema = z.enum(["joined", "mine", "discover"]);
export type GroupDirectoryMode = z.infer<typeof groupDirectoryModeSchema>;

export const createGroupSchema = z.object({
  name: z.string().min(2, "Name the group.").max(90),
  tagline: z.string().max(140).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  visibility: z.nativeEnum(GroupVisibility).default(GroupVisibility.PUBLIC),
  joinPolicy: z.nativeEnum(GroupJoinPolicy).default(GroupJoinPolicy.OPEN)
});

export const joinGroupSchema = z.object({
  note: z.string().max(500).optional().or(z.literal(""))
});

export const pinGroupSchema = z.object({
  pinned: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999).default(0)
});

export type GroupMemberView = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  role: GroupMemberRole;
  isProvider: boolean;
};

export type GroupCardView = {
  id: string;
  slug: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  visibility: GroupVisibility;
  joinPolicy: GroupJoinPolicy;
  memberCount: number;
  viewerRole?: GroupMemberRole | null;
  isPinned: boolean;
  createdAt: string;
};

export type GroupProfileView = GroupCardView & {
  creator?: {
    username: string;
    displayName: string;
    avatarUrl?: string | null;
  } | null;
  moderators: GroupMemberView[];
  membersPreview: GroupMemberView[];
  canJoin: boolean;
  canModerate: boolean;
  pendingJoinRequest: boolean;
};
