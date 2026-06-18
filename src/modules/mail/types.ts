import { MailAttachmentKind, MailDeliveryKind, MailRecipientType } from "@prisma/client";
import { z } from "zod";

export const MAX_MAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export const mailFolderSchema = z.enum(["inbox", "sent", "archive"]);
export type MailFolder = z.infer<typeof mailFolderSchema>;

export const sendMailAttachmentSchema = z.object({
  mediaAssetId: z.string().optional().or(z.literal("")),
  kind: z.nativeEnum(MailAttachmentKind),
  fileName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_MAIL_ATTACHMENT_BYTES),
  storageKey: z.string().max(600).optional().or(z.literal("")),
  publicUrl: z.string().url().optional().or(z.literal(""))
});

export const sendMailSchema = z
  .object({
    threadId: z.string().optional().or(z.literal("")),
    recipientUserIds: z.array(z.string().min(1)).min(1).max(100),
    subject: z.string().min(1, "Add a subject.").max(180),
    bodyText: z.string().min(1, "Write the message.").max(12000),
    bodyHtml: z.string().max(20000).optional().or(z.literal("")),
    deliveryKind: z.nativeEnum(MailDeliveryKind).optional(),
    attachments: z.array(sendMailAttachmentSchema).max(10).default([])
  })
  .transform((value) => ({
    ...value,
    recipientUserIds: Array.from(new Set(value.recipientUserIds))
  }));

export const createMailUploadIntentSchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_MAIL_ATTACHMENT_BYTES)
});

export const completeMailUploadSchema = createMailUploadIntentSchema.extend({
  storageKey: z.string().min(1).max(600)
});

export const updateMailPreferenceSchema = z.object({
  allowMassMail: z.boolean()
});

export type MailPersonView = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  tagline?: string | null;
};

export type MailAttachmentView = {
  id: string;
  kind: MailAttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: string;
  publicUrl?: string | null;
  mediaAssetId?: string | null;
};

export type MailRecipientView = {
  id: string;
  type: MailRecipientType;
  readAt?: string | null;
  user: MailPersonView;
};

export type MailMessageView = {
  id: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  createdAt: string;
  sender: MailPersonView;
  recipients: MailRecipientView[];
  attachments: MailAttachmentView[];
};

export type MailThreadSummaryView = {
  id: string;
  subject: string;
  deliveryKind: MailDeliveryKind;
  lastMessageAt?: string | null;
  unread: boolean;
  preview: string;
  sender: MailPersonView;
  recipients: MailRecipientView[];
};

export type MailThreadDetailView = MailThreadSummaryView & {
  messages: MailMessageView[];
};

export type MailPreferenceView = {
  allowMassMail: boolean;
};

export type MailPolicyConfigView = {
  contributorMassRecipientCap: number;
  professionalMassRecipientCap: number;
  auditorMassRecipientCap: number;
  adminMassRecipientCap: number;
  massMailCostPerRecipientCredits: number;
};
