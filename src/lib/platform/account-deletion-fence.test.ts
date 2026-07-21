import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { DestructiveActionStatus, type Prisma } from "@prisma/client";
import {
  ACCOUNT_DELETION_FENCE_STATUSES,
  AccountDeletionFenceConflictError,
  assertAccountDeletionFenceOpen
} from "@/lib/platform/account-deletion-fence";

function fakeFenceTransaction(input: {
  users: Array<{ id: string; deactivatedAt: Date | null }>;
  deletionTargetUserIds?: string[];
  events?: string[];
}) {
  return {
    $queryRaw: async () => {
      input.events?.push("users-locked");
      return input.users;
    },
    destructiveActionRequest: {
      findMany: async () => {
        input.events?.push("deletions-read");
        return (input.deletionTargetUserIds ?? []).map((targetId) => ({ targetId }));
      }
    }
  } as unknown as Prisma.TransactionClient;
}

test("deletion fence covers confirmed through completed account deletion", () => {
  assert.deepEqual(ACCOUNT_DELETION_FENCE_STATUSES, [
    DestructiveActionStatus.CONFIRMED,
    DestructiveActionStatus.QUEUED,
    DestructiveActionStatus.RUNNING,
    DestructiveActionStatus.SUCCEEDED
  ]);
});

test("deletion fence locks active owners before accepting a write", async () => {
  const events: string[] = [];
  await assertAccountDeletionFenceOpen(fakeFenceTransaction({
    users: [{ id: "member-1", deactivatedAt: null }],
    events
  }), ["member-1"]);
  assert.deepEqual(events, ["users-locked", "deletions-read"]);
});

test("deletion fence rejects deactivated, queued, and missing owners", async () => {
  const cases = [
    fakeFenceTransaction({ users: [{ id: "member-1", deactivatedAt: new Date() }] }),
    fakeFenceTransaction({
      users: [{ id: "member-1", deactivatedAt: null }],
      deletionTargetUserIds: ["member-1"]
    }),
    fakeFenceTransaction({ users: [] })
  ];

  for (const tx of cases) {
    await assert.rejects(
      () => assertAccountDeletionFenceOpen(tx, ["member-1"], "fenced"),
      (error: unknown) => {
        assert.ok(error instanceof AccountDeletionFenceConflictError);
        assert.equal(error.message, "fenced");
        assert.deepEqual(error.userIds, ["member-1"]);
        return true;
      }
    );
  }
});

test("confirmation and competing retention or upload writes share the same transactional user lock", () => {
  const lifecycle = readFileSync(resolve(
    "src/modules/admin-moderation/account-lifecycle.service.ts"
  ), "utf8");
  const upload = readFileSync(resolve("src/modules/media/upload-intent.service.ts"), "utf8");
  const feed = readFileSync(resolve("src/modules/feed-stream/feed-retention.service.ts"), "utf8");
  const chat = readFileSync(resolve("src/modules/chat-messages/chat-messages.service.ts"), "utf8");
  const mobileEncryptedChat = readFileSync(resolve(
    "src/app/api/mobile/chat/encrypted/route.ts"
  ), "utf8");
  const announcementDelivery = readFileSync(resolve(
    "src/modules/admin-moderation/delivery-outbox.service.ts"
  ), "utf8");

  const confirmationLock = lifecycle.indexOf("await lockAccountDeletionFenceUsers(tx, [target.id])");
  const manifestSeal = lifecycle.indexOf("const storageManifest = await persistAccountDeletionStorageManifest");
  assert.ok(confirmationLock > 0 && manifestSeal > confirmationLock);

  const uploadTransaction = upload.indexOf("const outcome = await prisma.$transaction");
  const uploadFence = upload.indexOf("await assertAccountDeletionFenceOpen", uploadTransaction);
  const uploadConsume = upload.indexOf("const value = await input.consume", uploadFence);
  assert.ok(uploadTransaction > 0 && uploadFence > uploadTransaction && uploadConsume > uploadFence);

  assert.equal(feed.match(/await assertAccountDeletionFenceOpen\(/g)?.length, 2);
  assert.equal(chat.match(/resolveChatRetentionClassForWrite\(tx,/g)?.length, 4);
  assert.equal(mobileEncryptedChat.match(/resolveChatRetentionClassForWrite\(tx,/g)?.length, 1);
  assert.equal(chat.match(/await assertChatMessageWriteAllowed\(tx,/g)?.length, 3);
  assert.equal(mobileEncryptedChat.match(/await assertChatMessageWriteAllowed\(tx,/g)?.length, 1);
  assert.equal(announcementDelivery.match(/await assertChatMessageWriteAllowed\(/g)?.length, 1);
  assert.equal(chat.match(/await validateEncryptedEnvelopeDevicesForWrite\(tx,/g)?.length, 1);
  assert.equal(mobileEncryptedChat.match(/await validateEncryptedEnvelopeDevicesForWrite\(tx,/g)?.length, 1);
  const desktopDeviceFence = chat.indexOf("await validateEncryptedEnvelopeDevicesForWrite(tx");
  const desktopEncryptedInsert = chat.indexOf("tx.encryptedChatMessage.create", desktopDeviceFence);
  const mobileDeviceFence = mobileEncryptedChat.indexOf("await validateEncryptedEnvelopeDevicesForWrite(tx");
  const mobileEncryptedInsert = mobileEncryptedChat.indexOf("tx.encryptedChatMessage.create", mobileDeviceFence);
  assert.ok(desktopDeviceFence > 0 && desktopEncryptedInsert > desktopDeviceFence);
  assert.ok(mobileDeviceFence > 0 && mobileEncryptedInsert > mobileDeviceFence);
});
