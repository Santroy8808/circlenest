import assert from "node:assert/strict";
import test from "node:test";
import {
  EncryptedChatMessageKind,
  EncryptedChatThreadType
} from "@prisma/client";
import {
  acknowledgeThetaCommMessageSchema,
  createThetaCommConversationSchema,
  createThetaCommUploadSchema,
  sendThetaCommMessageSchema,
  THETA_COMM_PROTOCOL_VERSION
} from "@/modules/theta-comm/types";
import {
  directConversationKey,
  identityKeyFingerprint
} from "@/modules/theta-comm/theta-comm.shared";

const envelope = {
  recipientUserId: "user-1",
  recipientDeviceId: "device-1",
  recipientKeyVersion: 1,
  envelopeType: "SESSION" as const,
  ciphertext: Buffer.from("ciphertext").toString("base64")
};

test("direct conversation identifiers are stable regardless of member order", () => {
  assert.equal(
    directConversationKey(["user-b", "user-a"]),
    directConversationKey(["user-a", "user-b"])
  );
});

test("chat groups remain a distinct encrypted conversation contract", () => {
  const result = createThetaCommConversationSchema.safeParse({
    type: EncryptedChatThreadType.GROUP,
    clientMessageId: "3fd28d86-f143-4ed1-9d4d-78d777205779",
    senderDeviceId: "sender-device",
    clientCreatedAt: "2026-07-29T12:00:00.000Z",
    participantUserIds: ["user-2", "user-3"],
    titleCiphertext: Buffer.from("encrypted title").toString("base64"),
    metadataEnvelopes: [envelope]
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.type, EncryptedChatThreadType.GROUP);
});

test("V2 messages require a UUID idempotency key and protocol version", () => {
  const base = {
    conversationId: "conversation-1",
    senderDeviceId: "sender-device",
    kind: EncryptedChatMessageKind.TEXT,
    protocolVersion: THETA_COMM_PROTOCOL_VERSION,
    membershipVersion: 1,
    clientCreatedAt: "2026-07-29T12:00:00.000Z",
    envelopes: [envelope]
  };
  assert.equal(
    sendThetaCommMessageSchema.safeParse({
      ...base,
      clientMessageId: "3fd28d86-f143-4ed1-9d4d-78d777205779"
    }).success,
    true
  );
  assert.equal(
    sendThetaCommMessageSchema.safeParse({ ...base, clientMessageId: "not-idempotent" }).success,
    false
  );
  assert.equal(
    sendThetaCommMessageSchema.safeParse({
      ...base,
      clientMessageId: "3fd28d86-f143-4ed1-9d4d-78d777205779",
      envelopes: [{ ...envelope, recipientKeyVersion: undefined }]
    }).success,
    false
  );
});

test("delivery receipts distinguish delivered from seen", () => {
  const base = {
    conversationId: "conversation-1",
    messageId: "message-1",
    recipientDeviceId: "device-1",
    occurredAt: "2026-07-29T12:00:00.000Z"
  };
  assert.equal(
    acknowledgeThetaCommMessageSchema.safeParse({ ...base, status: "DELIVERED" }).success,
    true
  );
  assert.equal(
    acknowledgeThetaCommMessageSchema.safeParse({ ...base, status: "SEEN" }).success,
    true
  );
  assert.equal(
    acknowledgeThetaCommMessageSchema.safeParse({ ...base, status: "PUSHED" }).success,
    false
  );
});

test("encrypted media upload accepts opaque bytes and encrypted thumbnails", () => {
  const result = createThetaCommUploadSchema.safeParse({
    conversationId: "conversation-1",
    senderDeviceId: "sender-device",
    encryptedSizeBytes: 8 * 1024 * 1024,
    ciphertextSha256: "a".repeat(64),
    encryptedThumbnail: {
      sizeBytes: 32 * 1024,
      ciphertextSha256: "b".repeat(64)
    }
  });
  assert.equal(result.success, true);
});

test("identity fingerprints are deterministic SHA-256 values", () => {
  assert.match(identityKeyFingerprint("identity-key"), /^[a-f0-9]{64}$/);
  assert.equal(identityKeyFingerprint("identity-key"), identityKeyFingerprint("identity-key"));
});
