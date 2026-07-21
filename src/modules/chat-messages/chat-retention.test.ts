import assert from "node:assert/strict";
import test from "node:test";
import { RecordRetentionClass, type Prisma, UserRole } from "@prisma/client";
import { AccountDeletionFenceConflictError } from "@/lib/platform/account-deletion-fence";
import {
  assertChatMessageWriteAllowed,
  chatRetentionClassForRoles,
  resolveChatRetentionClass,
  resolveChatRetentionClassForWrite,
  validateEncryptedEnvelopeDevicesForWrite
} from "./chat-retention";

test("ordinary member chats receive standard retention", () => {
  assert.equal(
    chatRetentionClassForRoles([UserRole.MEMBER, UserRole.MEMBER]),
    RecordRetentionClass.STANDARD
  );
});

test("admin and god participation permanently classifies a chat as vital", () => {
  assert.equal(
    chatRetentionClassForRoles([UserRole.MEMBER, UserRole.ADMIN]),
    RecordRetentionClass.VITAL
  );
  assert.equal(
    chatRetentionClassForRoles([UserRole.GOD, UserRole.MEMBER]),
    RecordRetentionClass.VITAL
  );
});

test("thread creation resolves retention from unique participant identities", async () => {
  let requestedUserIds: readonly string[] = [];
  const retentionClass = await resolveChatRetentionClass(
    ["member-1", "admin-1", "member-1"],
    async (userIds) => {
      requestedUserIds = userIds;
      return [UserRole.MEMBER, UserRole.ADMIN];
    }
  );

  assert.deepEqual(requestedUserIds, ["member-1", "admin-1"]);
  assert.equal(retentionClass, RecordRetentionClass.VITAL);
});

function fakeRetentionTransaction(
  deletionTargetUserIds: string[] = [],
  roles: UserRole[] = [UserRole.MEMBER, UserRole.ADMIN]
) {
  return {
    user: {
      findMany: async () => roles.map((role) => ({ role }))
    },
    $queryRaw: async () => [
      { id: "admin-1", deactivatedAt: null },
      { id: "member-1", deactivatedAt: null }
    ],
    destructiveActionRequest: {
      findMany: async () => deletionTargetUserIds.map((targetId) => ({ targetId }))
    }
  } as unknown as Prisma.TransactionClient;
}

test("VITAL retention is fenced in the same transaction as classification", async () => {
  assert.equal(
    await resolveChatRetentionClassForWrite(
      fakeRetentionTransaction(),
      ["member-1", "admin-1"]
    ),
    RecordRetentionClass.VITAL
  );

  await assert.rejects(
    () => resolveChatRetentionClassForWrite(
      fakeRetentionTransaction(["member-1"]),
      ["member-1", "admin-1"]
    ),
    AccountDeletionFenceConflictError
  );
});

test("STANDARD thread creation fences every participant", async () => {
  await assert.rejects(
    () => resolveChatRetentionClassForWrite(
      fakeRetentionTransaction(["admin-1"], [UserRole.MEMBER, UserRole.MEMBER]),
      ["member-1", "admin-1"]
    ),
    AccountDeletionFenceConflictError
  );
});

function fakeMessageWriteTransaction(input: {
  retentionClass: RecordRetentionClass;
  deletionTargetUserIds?: string[];
  omitUserIds?: string[];
}) {
  const allUsers = ["admin-1", "member-1", "attachment-owner-1"];
  return {
    chatThread: {
      findUnique: async () => ({
        retentionClass: input.retentionClass,
        participants: [{ userId: "admin-1" }, { userId: "member-1" }]
      })
    },
    encryptedChatThread: {
      findUnique: async () => ({
        retentionClass: input.retentionClass,
        participants: [{ userId: "admin-1" }, { userId: "member-1" }]
      })
    },
    mediaAsset: {
      findMany: async () => [{ id: "asset-1", ownerUserId: "attachment-owner-1" }]
    },
    $queryRaw: async () => allUsers
      .filter((userId) => !(input.omitUserIds ?? []).includes(userId))
      .map((id) => ({ id, deactivatedAt: null })),
    destructiveActionRequest: {
      findMany: async () => (input.deletionTargetUserIds ?? []).map((targetId) => ({ targetId }))
    }
  } as unknown as Prisma.TransactionClient;
}

test("message fence always blocks a deleting sender", async () => {
  await assert.rejects(
    () => assertChatMessageWriteAllowed(fakeMessageWriteTransaction({
      retentionClass: RecordRetentionClass.STANDARD,
      deletionTargetUserIds: ["member-1"]
    }), {
      threadKind: "CHAT",
      threadId: "thread-1",
      senderUserId: "member-1"
    }),
    AccountDeletionFenceConflictError
  );
});

test("STANDARD message fence blocks any deleting participant", async () => {
  await assert.rejects(
    () => assertChatMessageWriteAllowed(fakeMessageWriteTransaction({
      retentionClass: RecordRetentionClass.STANDARD,
      deletionTargetUserIds: ["admin-1"]
    }), {
      threadKind: "CHAT",
      threadId: "thread-1",
      senderUserId: "member-1"
    }),
    AccountDeletionFenceConflictError
  );
});

test("existing VITAL message fence includes participants and attachment owners", async () => {
  await assert.rejects(
    () => assertChatMessageWriteAllowed(fakeMessageWriteTransaction({
      retentionClass: RecordRetentionClass.VITAL,
      omitUserIds: ["attachment-owner-1"]
    }), {
      threadKind: "CHAT",
      threadId: "thread-1",
      senderUserId: "member-1",
      attachmentMediaAssetIds: ["asset-1"]
    }),
    AccountDeletionFenceConflictError
  );
});

function fakeEncryptedDeviceTransaction(devices: Array<{
  id: string;
  userId: string;
  revokedAt: Date | null;
}>) {
  return {
    userDevice: { findMany: async () => devices }
  } as unknown as Prisma.TransactionClient;
}

test("encrypted envelope devices are revalidated against fenced participants", async () => {
  const valid = await validateEncryptedEnvelopeDevicesForWrite(
    fakeEncryptedDeviceTransaction([
      { id: "device-1", userId: "member-1", revokedAt: null },
      { id: "sender-device", userId: "admin-1", revokedAt: null }
    ]),
    {
      participantUserIds: ["member-1", "admin-1"],
      envelopes: [{ recipientUserId: "member-1", recipientDeviceId: "device-1" }],
      senderDevice: { id: "sender-device", userId: "admin-1" }
    }
  );
  assert.equal(valid, true);

  const stale = await validateEncryptedEnvelopeDevicesForWrite(
    fakeEncryptedDeviceTransaction([
      { id: "device-1", userId: "member-1", revokedAt: new Date() }
    ]),
    {
      participantUserIds: ["member-1", "admin-1"],
      envelopes: [{ recipientUserId: "member-1", recipientDeviceId: "device-1" }]
    }
  );
  assert.equal(stale, false);
});
