import { ChatAttachmentKind, ChatThreadType } from "@prisma/client";
import { z } from "zod";

export const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export const createDirectChatThreadSchema = z.object({
  targetUserId: z.string().min(1)
});

export const createGroupChatThreadSchema = z.object({
  title: z.string().min(2, "Name the group chat.").max(80),
  participantUserIds: z.array(z.string().min(1)).min(1).max(24)
});

export const sendChatAttachmentSchema = z.object({
  mediaAssetId: z.string().optional().or(z.literal("")),
  kind: z.nativeEnum(ChatAttachmentKind),
  fileName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_CHAT_ATTACHMENT_BYTES),
  storageKey: z.string().max(600).optional().or(z.literal("")),
  publicUrl: z.string().url().nullable().optional().or(z.literal(""))
});

export const sendChatMessageSchema = z
  .object({
    threadId: z.string().min(1),
    body: z.string().max(4000).optional().or(z.literal("")),
    attachments: z.array(sendChatAttachmentSchema).max(10).default([])
  })
  .refine((value) => Boolean(value.body?.trim()) || value.attachments.length > 0, {
    message: "Write a message or attach a file."
  });

export const createChatUploadIntentSchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_CHAT_ATTACHMENT_BYTES)
});

export const completeChatUploadSchema = createChatUploadIntentSchema.extend({
  storageKey: z.string().min(1).max(600),
  thumbnailStorageKey: z.string().min(1).max(600).optional()
});

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
};
