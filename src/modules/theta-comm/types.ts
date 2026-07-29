import {
  EncryptedChatMessageKind,
  EncryptedChatNotificationLevel,
  EncryptedChatParticipantRole,
  EncryptedChatThreadType
} from "@prisma/client";
import { z } from "zod";

export const THETA_COMM_PROTOCOL_VERSION = 2;
export const THETA_COMM_MAX_PARTICIPANTS = 100;
export const THETA_COMM_MAX_DEVICES_PER_USER = 10;
export const THETA_COMM_MAX_ENVELOPES_PER_MESSAGE =
  THETA_COMM_MAX_PARTICIPANTS * THETA_COMM_MAX_DEVICES_PER_USER;
export const THETA_COMM_MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const THETA_COMM_MAX_ENCRYPTED_ATTACHMENT_BYTES = 250 * 1024 * 1024;
export const THETA_COMM_UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;
export const THETA_COMM_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const THETA_COMM_DELETE_WINDOW_MS = 48 * 60 * 60 * 1000;
export const THETA_COMM_TYPING_TTL_MS = 8_000;

const opaqueIdSchema = z.string().trim().min(1).max(128);
const deviceIdentifierSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{16,128}$/);
const base64Schema = z
  .string()
  .trim()
  .min(16)
  .max(512 * 1024)
  .regex(/^[A-Za-z0-9+/_=-]+$/, "Expected base64-encoded binary data.");
const clientMessageIdSchema = z.string().uuid();

export const thetaCommPreKeySchema = z.object({
  keyId: z.number().int().min(1).max(2_147_483_647),
  publicKey: base64Schema.max(8 * 1024)
});

export const thetaCommSignedPreKeySchema = thetaCommPreKeySchema.extend({
  signature: base64Schema.max(8 * 1024)
});

export const registerThetaCommDeviceSchema = z.object({
  deviceId: deviceIdentifierSchema,
  platform: z.enum(["android", "ios", "desktop"]),
  appVersion: z.string().trim().min(1).max(32),
  registrationId: z.number().int().min(1).max(16_383),
  identityKey: base64Schema.max(8 * 1024),
  signedPreKey: thetaCommSignedPreKeySchema,
  oneTimePreKeys: z.array(thetaCommPreKeySchema).min(1).max(100),
  push: z
    .object({
      provider: z.literal("FCM"),
      token: z.string().trim().min(32).max(4_096),
      appInstanceId: z.string().trim().min(1).max(256).optional()
    })
    .optional()
});

export const replenishThetaCommPreKeysSchema = z.object({
  deviceId: deviceIdentifierSchema,
  oneTimePreKeys: z.array(thetaCommPreKeySchema).min(1).max(100)
});

export const thetaCommRecipientEnvelopeSchema = z.object({
  recipientUserId: opaqueIdSchema,
  recipientDeviceId: opaqueIdSchema,
  envelopeType: z.enum(["PREKEY", "SESSION"]),
  ciphertext: base64Schema
});

export const createThetaCommDirectConversationSchema = z.object({
  type: z.literal(EncryptedChatThreadType.DIRECT),
  targetUserId: opaqueIdSchema
});

export const createThetaCommGroupConversationSchema = z.object({
  type: z.literal(EncryptedChatThreadType.GROUP),
  participantUserIds: z
    .array(opaqueIdSchema)
    .min(2)
    .max(THETA_COMM_MAX_PARTICIPANTS - 1)
    .transform((ids) => Array.from(new Set(ids))),
  titleCiphertext: base64Schema.max(32 * 1024),
  metadataEnvelopes: z
    .array(thetaCommRecipientEnvelopeSchema)
    .min(1)
    .max(THETA_COMM_MAX_ENVELOPES_PER_MESSAGE)
});

export const createThetaCommConversationSchema = z.discriminatedUnion("type", [
  createThetaCommDirectConversationSchema,
  createThetaCommGroupConversationSchema
]);

export const thetaCommMessageEnvelopeSchema = thetaCommRecipientEnvelopeSchema;

export const sendThetaCommMessageSchema = z.object({
  clientMessageId: clientMessageIdSchema,
  conversationId: opaqueIdSchema,
  senderDeviceId: opaqueIdSchema,
  kind: z.nativeEnum(EncryptedChatMessageKind),
  protocolVersion: z.literal(THETA_COMM_PROTOCOL_VERSION),
  membershipVersion: z.number().int().positive(),
  replyToMessageId: opaqueIdSchema.optional(),
  eventTargetMessageId: opaqueIdSchema.optional(),
  clientCreatedAt: z.string().datetime({ offset: true }),
  envelopes: z
    .array(thetaCommMessageEnvelopeSchema)
    .min(1)
    .max(THETA_COMM_MAX_ENVELOPES_PER_MESSAGE),
  attachmentUploadIds: z
    .array(opaqueIdSchema)
    .max(THETA_COMM_MAX_ATTACHMENTS_PER_MESSAGE)
    .default([])
});

export const acknowledgeThetaCommMessageSchema = z.object({
  conversationId: opaqueIdSchema,
  messageId: opaqueIdSchema,
  recipientDeviceId: opaqueIdSchema,
  status: z.enum(["DELIVERED", "SEEN"]),
  occurredAt: z.string().datetime({ offset: true })
});

export const createThetaCommUploadSchema = z.object({
  conversationId: opaqueIdSchema.optional(),
  senderDeviceId: opaqueIdSchema,
  encryptedSizeBytes: z
    .number()
    .int()
    .positive()
    .max(THETA_COMM_MAX_ENCRYPTED_ATTACHMENT_BYTES),
  ciphertextSha256: z.string().trim().regex(/^[a-f0-9]{64}$/i),
  hasEncryptedThumbnail: z.boolean().default(false)
});

export const completeThetaCommUploadSchema = z.object({
  uploadId: opaqueIdSchema,
  uploadedSizeBytes: z
    .number()
    .int()
    .positive()
    .max(THETA_COMM_MAX_ENCRYPTED_ATTACHMENT_BYTES),
  ciphertextSha256: z.string().trim().regex(/^[a-f0-9]{64}$/i)
});

export const updateThetaCommConversationPreferenceSchema = z.object({
  archived: z.boolean().optional(),
  pinned: z.boolean().optional(),
  mutedUntil: z.string().datetime({ offset: true }).nullable().optional(),
  notificationLevel: z.nativeEnum(EncryptedChatNotificationLevel).optional()
});

export const thetaCommGroupCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ADD_MEMBERS"),
    userIds: z.array(opaqueIdSchema).min(1).max(THETA_COMM_MAX_PARTICIPANTS)
  }),
  z.object({
    action: z.literal("REMOVE_MEMBER"),
    userId: opaqueIdSchema
  }),
  z.object({
    action: z.literal("SET_ROLE"),
    userId: opaqueIdSchema,
    role: z.enum([EncryptedChatParticipantRole.ADMIN, EncryptedChatParticipantRole.MEMBER])
  }),
  z.object({
    action: z.literal("LEAVE")
  }),
  z.object({
    action: z.literal("RENAME"),
    titleCiphertext: base64Schema.max(32 * 1024),
    metadataEnvelopes: z
      .array(thetaCommRecipientEnvelopeSchema)
      .min(1)
      .max(THETA_COMM_MAX_ENVELOPES_PER_MESSAGE)
  }),
  z.object({
    action: z.literal("SET_AVATAR"),
    uploadId: opaqueIdSchema.nullable()
  })
]);

export const thetaCommTypingSchema = z.object({
  conversationId: opaqueIdSchema,
  senderDeviceId: opaqueIdSchema,
  typing: z.boolean()
});

export const thetaCommSyncQuerySchema = z.object({
  cursor: z.string().trim().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

export type ThetaCommMessageStatus = "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "SEEN" | "FAILED";

export type ThetaCommDeviceView = {
  id: string;
  deviceId: string;
  platform: string;
  appVersion?: string | null;
  lastSeenAt: string;
  revokedAt?: string | null;
  verified: boolean;
};

export type ThetaCommParticipantView = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  role: EncryptedChatParticipantRole;
  joinedAt: string;
  leftAt?: string | null;
  removedAt?: string | null;
};

export type ThetaCommConversationView = {
  id: string;
  type: EncryptedChatThreadType;
  titleCiphertext?: string | null;
  membershipVersion: number;
  lastSequence: string;
  lastMessageAt?: string | null;
  unreadCount: number;
  participants: ThetaCommParticipantView[];
};

export type ThetaCommEnvelopeView = {
  id: string;
  messageId: string;
  conversationId: string;
  senderUserId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  sequence: string;
  kind: EncryptedChatMessageKind;
  protocolVersion: number;
  membershipVersion: number;
  replyToMessageId?: string | null;
  eventTargetMessageId?: string | null;
  ciphertext: string;
  createdAt: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  attachmentIds: string[];
};

export type ThetaCommSyncView = {
  cursor?: string;
  hasMore: boolean;
  conversations: ThetaCommConversationView[];
  envelopes: ThetaCommEnvelopeView[];
  revokedDeviceIds: string[];
};
