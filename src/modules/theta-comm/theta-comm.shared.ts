import { createHash } from "crypto";
import {
  EncryptedChatParticipantRole,
  Prisma,
  ThetaCommSyncEventKind
} from "@prisma/client";
import { prisma } from "@/lib/platform/db";

export class ThetaCommError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function directConversationKey(userIds: readonly string[]) {
  const unique = [...new Set(userIds)].sort();
  return createHash("sha256")
    .update(`theta-comm-direct-v2\0${unique.join("\0")}`)
    .digest("hex");
}

export function identityKeyFingerprint(identityKey: string) {
  return createHash("sha256").update(identityKey).digest("hex");
}

export function isActiveParticipant(participant: { leftAt: Date | null; removedAt: Date | null }) {
  return participant.leftAt === null && participant.removedAt === null;
}

export function canAdministerConversation(role: EncryptedChatParticipantRole) {
  return role === EncryptedChatParticipantRole.OWNER || role === EncryptedChatParticipantRole.ADMIN;
}

export async function requireOwnedActiveDevice(
  userId: string,
  deviceId: string,
  options: { requireV2?: boolean } = {}
) {
  const device = await prisma.userDevice.findFirst({
    where: {
      id: deviceId,
      userId,
      revokedAt: null,
      ...(options.requireV2 ? { commIdentityKey: { not: null } } : {})
    }
  });
  if (!device) throw new ThetaCommError(400, "DEVICE_NOT_REGISTERED", "This Theta-Comm device is not registered.");
  return device;
}

export async function createSyncEvents(
  tx: Prisma.TransactionClient,
  input: {
    userIds: readonly string[];
    kind: ThetaCommSyncEventKind;
    conversationId?: string;
    messageId?: string;
    payload?: Prisma.InputJsonValue;
  }
) {
  const userIds = [...new Set(input.userIds.filter(Boolean))];
  if (userIds.length === 0) return;
  await tx.thetaCommSyncEvent.createMany({
    data: userIds.map((userId) => ({
      userId,
      kind: input.kind,
      conversationId: input.conversationId,
      messageId: input.messageId,
      payload: input.payload
    }))
  });
}

export async function enqueuePushWakeups(
  tx: Prisma.TransactionClient,
  input: {
    userIds: readonly string[];
    excludeDeviceIds?: readonly string[];
    conversationId?: string;
    reason: "message" | "receipt" | "membership" | "device";
  }
) {
  const userIds = [...new Set(input.userIds.filter(Boolean))];
  if (userIds.length === 0) return;
  const excluded = new Set(input.excludeDeviceIds ?? []);
  const devices = await tx.userDevice.findMany({
    where: {
      userId: { in: userIds },
      revokedAt: null,
      commIdentityKey: { not: null },
      commPushRegistrations: { some: { enabled: true } }
    },
    select: { id: true }
  });
  const targetDeviceIds = devices.map((device) => device.id).filter((id) => !excluded.has(id));
  if (targetDeviceIds.length === 0) return;
  await tx.thetaCommPushOutbox.createMany({
    data: targetDeviceIds.map((userDeviceId) => ({
      userDeviceId,
      payload: {
        type: "theta_comm_sync",
        reason: input.reason,
        ...(input.conversationId ? { conversationId: input.conversationId } : {})
      }
    }))
  });
}

export function clampClientDate(value: string) {
  const parsed = new Date(value);
  const now = Date.now();
  if (Number.isNaN(parsed.getTime())) return new Date(now);
  const maximumSkewMs = 5 * 60 * 1000;
  return new Date(Math.min(Math.max(parsed.getTime(), now - maximumSkewMs), now + maximumSkewMs));
}

export function serializeDevice(device: {
  id: string;
  deviceId: string;
  platform: string;
  appVersion: string | null;
  lastSeenAt: Date;
  revokedAt: Date | null;
  commIdentityKey: string | null;
  commKeyVersion: number;
}) {
  return {
    id: device.id,
    deviceId: device.deviceId,
    platform: device.platform,
    appVersion: device.appVersion,
    lastSeenAt: device.lastSeenAt.toISOString(),
    revokedAt: device.revokedAt?.toISOString() ?? null,
    keyVersion: device.commKeyVersion,
    identityKeyFingerprint: device.commIdentityKey
      ? identityKeyFingerprint(device.commIdentityKey)
      : null
  };
}

export async function validateCompleteRecipientSet(
  tx: Prisma.TransactionClient,
  participantUserIds: readonly string[],
  envelopes: ReadonlyArray<{
    recipientUserId: string;
    recipientDeviceId: string;
    envelopeType: "PREKEY" | "SESSION";
    ciphertext: string;
  }>,
  excludedDeviceIds: readonly string[] = []
) {
  const participantIds = [...new Set(participantUserIds)];
  const devices = await tx.userDevice.findMany({
    where: {
      userId: { in: participantIds },
      id: { notIn: [...new Set(excludedDeviceIds)] },
      revokedAt: null,
      commIdentityKey: { not: null }
    },
    select: { id: true, userId: true }
  });
  const expectedByDevice = new Map(devices.map((device) => [device.id, device.userId]));
  const received = new Set<string>();
  for (const envelope of envelopes) {
    if (
      received.has(envelope.recipientDeviceId) ||
      expectedByDevice.get(envelope.recipientDeviceId) !== envelope.recipientUserId
    ) {
      throw new ThetaCommError(
        409,
        "RECIPIENT_DEVICES_CHANGED",
        "Recipient devices changed. Refresh encryption keys and retry."
      );
    }
    received.add(envelope.recipientDeviceId);
  }
  if (received.size !== expectedByDevice.size || [...expectedByDevice.keys()].some((id) => !received.has(id))) {
    throw new ThetaCommError(
      409,
      "RECIPIENT_DEVICES_CHANGED",
      "Recipient devices changed. Refresh encryption keys and retry."
    );
  }
  return devices;
}
