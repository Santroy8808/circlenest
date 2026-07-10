import { GroupJoinPolicy, GroupMemberRole, GroupVisibility } from "@prisma/client";
import { z } from "zod";

export const MAX_GROUP_PARTICIPANTS = 500;
export const DEFAULT_GROUP_DIRECTORY_PAGE_SIZE = 24;
export const MAX_GROUP_DIRECTORY_PAGE_SIZE = 60;
export const DEFAULT_GROUP_MEMBER_PAGE_SIZE = 12;
export const MAX_GROUP_MEMBER_PAGE_SIZE = 50;
export const MAX_GROUP_IDENTIFIER_LENGTH = 128;
export const MAX_GROUP_DIRECTORY_QUERY_LENGTH = 120;

export const groupDirectoryModeSchema = z.enum(["joined", "mine", "discover"]);
export type GroupDirectoryMode = z.infer<typeof groupDirectoryModeSchema>;

export const createGroupSchema = z.object({
  name: z.string().trim().min(2, "Name the group.").max(90),
  tagline: z.string().trim().max(140).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  visibility: z.nativeEnum(GroupVisibility).default(GroupVisibility.PUBLIC),
  joinPolicy: z.nativeEnum(GroupJoinPolicy).default(GroupJoinPolicy.OPEN)
});

export const joinGroupSchema = z.object({
  note: z.string().trim().max(500).optional().or(z.literal(""))
});

export const pinGroupSchema = z.object({
  pinned: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999).default(0)
});

const groupEntityIdSchema = z.string().trim().min(1).max(MAX_GROUP_IDENTIFIER_LENGTH);

export const groupDirectoryPageSchema = z.object({
  cursor: groupEntityIdSchema.nullish(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_GROUP_DIRECTORY_PAGE_SIZE)
    .default(DEFAULT_GROUP_DIRECTORY_PAGE_SIZE),
  query: z.string().trim().max(MAX_GROUP_DIRECTORY_QUERY_LENGTH).nullish()
});

export const groupMemberPageSchema = z.object({
  cursor: groupEntityIdSchema.nullish(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_GROUP_MEMBER_PAGE_SIZE)
    .default(DEFAULT_GROUP_MEMBER_PAGE_SIZE)
});

export const addGroupMemberSchema = z
  .object({
    userId: groupEntityIdSchema.optional(),
    username: z.string().trim().min(1).max(80).optional()
  })
  .refine((value) => Number(Boolean(value.userId)) + Number(Boolean(value.username)) === 1, {
    message: "Choose one member to add."
  });

// Kept as an alias while the API is moved from the old "invite" wording to
// the direct moderator-add workflow used by the product.
export const inviteGroupMemberSchema = addGroupMemberSchema;

export const updateGroupMemberRoleSchema = z.object({
  targetUserId: groupEntityIdSchema,
  role: z.enum([GroupMemberRole.MEMBER, GroupMemberRole.MODERATOR])
});

export const removeGroupMemberSchema = z.object({
  targetUserId: groupEntityIdSchema
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
  membersNextCursor?: string | null;
};

export type GroupDirectoryPageView = {
  groups: GroupCardView[];
  nextCursor: string | null;
};

export type GroupMemberPageView = {
  members: GroupMemberView[];
  nextCursor: string | null;
};
