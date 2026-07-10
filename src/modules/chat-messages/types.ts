import { ChatAttachmentKind, ChatThreadType } from "@prisma/client";
import { z } from "zod";
import { cuidIdSchema } from "@/lib/platform/validation";

export const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_CHAT_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024;
export const MAX_CHAT_MESSAGE_CHARACTERS = 4000;
export const MAX_CHAT_ATTACHMENTS_PER_MESSAGE = 10;
export const MAX_CHAT_GROUP_PARTICIPANTS = 25;
export const DEFAULT_CHAT_MESSAGE_PAGE_SIZE = 60;
export const MAX_CHAT_MESSAGE_PAGE_SIZE = 100;

export const createDirectChatThreadSchema = z.object({
  targetUserId: z.string().min(1)
});

export const createGroupChatThreadSchema = z.object({
  title: z.string().min(2, "Name the group chat.").max(80),
  participantUserIds: z.array(z.string().min(1)).min(1).max(MAX_CHAT_GROUP_PARTICIPANTS - 1)
});

export const sendChatAttachmentSchema = z.object({
  mediaAssetId: cuidIdSchema
});

export const sendChatMessageSchema = z
  .object({
    threadId: z.string().min(1),
    body: z.string().max(MAX_CHAT_MESSAGE_CHARACTERS).optional().or(z.literal("")),
    attachments: z.array(sendChatAttachmentSchema).max(MAX_CHAT_ATTACHMENTS_PER_MESSAGE).default([])
  })
  .refine((value) => Boolean(value.body?.trim()) || value.attachments.length > 0, {
    message: "Write a message or attach a file."
  });

export const createChatUploadIntentSchema = z.object({
  checksumSha256: z.string().trim().max(160).optional().nullable(),
  fileName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_CHAT_ATTACHMENT_BYTES)
});

export const completeChatUploadSchema = createChatUploadIntentSchema.extend({
  intentId: z.string().trim().min(1).max(80),
  storageKey: z.string().min(1).max(600).optional(),
  thumbnailStorageKey: z.string().min(1).max(600).optional()
});

const chatCursorDateSchema = z
  .union([z.string().datetime({ offset: true }), z.date()])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

export const chatMessagePageSchema = z
  .object({
    afterMessageId: z.string().trim().min(1).max(64).optional(),
    afterCreatedAt: chatCursorDateSchema.optional(),
    beforeMessageId: z.string().trim().min(1).max(64).optional(),
    beforeCreatedAt: chatCursorDateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(MAX_CHAT_MESSAGE_PAGE_SIZE).default(DEFAULT_CHAT_MESSAGE_PAGE_SIZE)
  })
  .refine(
    (value) => !(value.afterMessageId || value.afterCreatedAt) || !(value.beforeMessageId || value.beforeCreatedAt),
    "Choose either an after cursor or a before cursor, not both."
  )
  .refine(
    (value) => Boolean(value.afterMessageId) === Boolean(value.afterCreatedAt),
    "An after cursor requires both message ID and timestamp."
  )
  .refine(
    (value) => Boolean(value.beforeMessageId) === Boolean(value.beforeCreatedAt),
    "A before cursor requires both message ID and timestamp."
  )
  .default({});

export type ChatPersonView = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  tagline?: string | null;
};

export type ChatAttachmentView = {
  id: string;
  kind: ChatAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: string;
  publicUrl?: string | null;
  thumbnailUrl?: string | null;
  mediaAssetId?: string | null;
};

export type ChatMessageView = {
  id: string;
  body?: string | null;
  createdAt: string;
  sender: ChatPersonView;
  attachments: ChatAttachmentView[];
  deliveryState?: "SENDING" | "SENT" | "SEEN" | "FAILED";
};

export type ChatThreadView = {
  id: string;
  type: ChatThreadType;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string | null;
  unread: boolean;
  participants: ChatPersonView[];
  lastMessage?: ChatMessageView | null;
};

export type ChatThreadDetailView = ChatThreadView & {
  messages: ChatMessageView[];
  messagePage: {
    oldestMessageId?: string;
    oldestCreatedAt?: string;
    newestMessageId?: string;
    newestCreatedAt?: string;
  };
};
