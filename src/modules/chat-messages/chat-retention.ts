import { Prisma, RecordRetentionClass, UserRole } from "@prisma/client";
import { assertAccountDeletionFenceOpen } from "@/lib/platform/account-deletion-fence";
import { prisma } from "@/lib/platform/db";

const ADMINISTRATIVE_CHAT_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.ADMIN,
  UserRole.GOD
]);

export function chatRetentionClassForRoles(roles: readonly UserRole[]) {
  return roles.some((role) => ADMINISTRATIVE_CHAT_ROLES.has(role))
    ? RecordRetentionClass.VITAL
    : RecordRetentionClass.STANDARD;
}

export type ChatParticipantRoleLookup = (
  participantUserIds: readonly string[]
) => Promise<readonly UserRole[]>;

async function readParticipantRoles(participantUserIds: readonly string[]) {
  const participants = await prisma.user.findMany({
    where: { id: { in: [...participantUserIds] } },
    select: { role: true }
  });
  return participants.map((participant) => participant.role);
}

export async function resolveChatRetentionClass(
  participantUserIds: readonly string[],
  lookupRoles: ChatParticipantRoleLookup = readParticipantRoles
) {
  const userIds = [...new Set(participantUserIds.filter(Boolean))];
  if (userIds.length === 0) return RecordRetentionClass.STANDARD;

  return chatRetentionClassForRoles(await lookupRoles(userIds));
}

export async function resolveChatRetentionClassForWrite(
  tx: Prisma.TransactionClient,
  participantUserIds: readonly string[]
) {
  const userIds = [...new Set(participantUserIds.filter(Boolean))].sort();
  if (userIds.length === 0) return RecordRetentionClass.STANDARD;

  const participants = await tx.user.findMany({
    where: { id: { in: userIds } },
    select: { role: true }
  });
  const retentionClass = chatRetentionClassForRoles(participants.map((participant) => participant.role));
  await assertAccountDeletionFenceOpen(
    tx,
    userIds,
    "A chat thread cannot be created after a participant is deactivated or queued for deletion."
  );
  return retentionClass;
}

type ChatMessageWriteFenceInput = {
  senderUserId: string;
  attachmentMediaAssetIds?: readonly string[];
} & (
  | { threadKind: "CHAT"; threadId: string }
  | { threadKind: "ENCRYPTED"; threadId: string }
  | { threadKind: "NEW_VITAL"; participantUserIds: readonly string[] }
);

export async function assertChatMessageWriteAllowed(
  tx: Prisma.TransactionClient,
  input: ChatMessageWriteFenceInput
) {
  const thread = input.threadKind === "NEW_VITAL"
    ? {
        retentionClass: RecordRetentionClass.VITAL,
        participantUserIds: [...input.participantUserIds]
      }
    : input.threadKind === "CHAT"
      ? await tx.chatThread.findUnique({
          where: { id: input.threadId },
          select: {
            retentionClass: true,
            participants: { select: { userId: true } }
          }
        }).then((record) => record && ({
          retentionClass: record.retentionClass,
          participantUserIds: record.participants.map((participant) => participant.userId)
        }))
      : await tx.encryptedChatThread.findUnique({
          where: { id: input.threadId },
          select: {
            retentionClass: true,
            participants: { select: { userId: true } }
          }
        }).then((record) => record && ({
          retentionClass: record.retentionClass,
          participantUserIds: record.participants.map((participant) => participant.userId)
        }));
  if (!thread || !thread.participantUserIds.includes(input.senderUserId)) return null;

  const fenceUserIds = [input.senderUserId, ...thread.participantUserIds];
  if (thread.retentionClass === RecordRetentionClass.VITAL) {
    const attachmentMediaAssetIds = [...new Set(
      (input.attachmentMediaAssetIds ?? []).filter(Boolean)
    )].sort();
    const attachmentOwners = attachmentMediaAssetIds.length
      ? await tx.mediaAsset.findMany({
          where: { id: { in: attachmentMediaAssetIds } },
          select: { id: true, ownerUserId: true }
        })
      : [];
    if (attachmentOwners.length !== attachmentMediaAssetIds.length) {
      throw new Error("A chat attachment owner changed while the message was being authorized.");
    }
    fenceUserIds.push(...attachmentOwners.map((attachment) => attachment.ownerUserId));
  }

  await assertAccountDeletionFenceOpen(
    tx,
    fenceUserIds,
    "A message cannot be sent after its sender, participant, or attachment owner is deactivated or queued for deletion."
  );
  return thread;
}

export async function validateEncryptedEnvelopeDevicesForWrite(
  tx: Prisma.TransactionClient,
  input: {
    participantUserIds: readonly string[];
    envelopes: ReadonlyArray<{ recipientUserId: string; recipientDeviceId: string }>;
    senderDevice?: { id: string; userId: string; allowRevoked?: boolean };
  }
) {
  const participantUserIds = new Set(input.participantUserIds);
  const recipientDeviceIds = input.envelopes.map((envelope) => envelope.recipientDeviceId);
  const uniqueRecipientDeviceIds = new Set(recipientDeviceIds);
  if (
    input.envelopes.length === 0 ||
    uniqueRecipientDeviceIds.size !== recipientDeviceIds.length ||
    input.envelopes.some((envelope) => !participantUserIds.has(envelope.recipientUserId))
  ) {
    return false;
  }

  const deviceIds = [...new Set([
    ...recipientDeviceIds,
    ...(input.senderDevice ? [input.senderDevice.id] : [])
  ])].sort();
  const activeDevices = await tx.userDevice.findMany({
    where: { id: { in: deviceIds } },
    select: { id: true, userId: true, revokedAt: true }
  });
  if (activeDevices.length !== deviceIds.length) return false;

  const devicesById = new Map(activeDevices.map((device) => [device.id, device]));
  if (input.envelopes.some(
    (envelope) => {
      const device = devicesById.get(envelope.recipientDeviceId);
      return !device || device.revokedAt !== null || device.userId !== envelope.recipientUserId;
    }
  )) {
    return false;
  }
  if (!input.senderDevice) return true;
  const senderDevice = devicesById.get(input.senderDevice.id);
  return Boolean(
    senderDevice &&
    senderDevice.userId === input.senderDevice.userId &&
    (input.senderDevice.allowRevoked || senderDevice.revokedAt === null)
  );
}
