import { MailAttachmentKind, MailDeliveryKind, MailRecipientType } from "@prisma/client";
import { z } from "zod";

export const MAX_MAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_MAIL_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024;
export const MAX_MAIL_ATTACHMENTS = 10;
export const MAX_MAIL_BODY_TEXT_LENGTH = 12000;
export const MAX_MAIL_BODY_HTML_LENGTH = 20000;
export const MAX_MAIL_RECIPIENTS = 100;

export const mailFolderSchema = z.enum(["inbox", "sent", "archive"]);
export type MailFolder = z.infer<typeof mailFolderSchema>;

export const sendMailAttachmentSchema = z.object({
  mediaAssetId: z.string().optional().or(z.literal("")),
  kind: z.nativeEnum(MailAttachmentKind),
  fileName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_MAIL_ATTACHMENT_BYTES),
  storageKey: z.string().max(600).optional().or(z.literal("")),
  publicUrl: z.string().url().nullable().optional().or(z.literal(""))
});

export const sendMailSchema = z
  .object({
    threadId: z.string().optional().or(z.literal("")),
    recipientUserIds: z.array(z.string().min(1)).min(1).max(MAX_MAIL_RECIPIENTS),
    subject: z.string().min(1, "Add a subject.").max(180),
    bodyText: z.string().min(1, "Write the message.").max(MAX_MAIL_BODY_TEXT_LENGTH),
    bodyHtml: z.string().max(MAX_MAIL_BODY_HTML_LENGTH).optional().or(z.literal("")),
    deliveryKind: z.nativeEnum(MailDeliveryKind).optional(),
    attachments: z.array(sendMailAttachmentSchema).max(MAX_MAIL_ATTACHMENTS).default([])
  })
  .transform((value) => ({
    ...value,
    recipientUserIds: Array.from(new Set(value.recipientUserIds))
  }))
  .superRefine((value, context) => {
    const totalAttachmentBytes = value.attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0);

    if (totalAttachmentBytes > MAX_MAIL_TOTAL_ATTACHMENT_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mail attachments may use at most 40 MB in total.",
        path: ["attachments"]
      });
    }
  });

export const createMailUploadIntentSchema = z.object({
  checksumSha256: z.string().trim().max(160).optional().nullable(),
  fileName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(MAX_MAIL_ATTACHMENT_BYTES)
});

export const completeMailUploadSchema = createMailUploadIntentSchema.extend({
  intentId: z.string().trim().min(1).max(80),
  storageKey: z.string().min(1).max(600).optional()
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
  nextCursor?: string | null;
};

export type MailThreadPageView = {
  threads: MailThreadSummaryView[];
  nextCursor: string | null;
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
