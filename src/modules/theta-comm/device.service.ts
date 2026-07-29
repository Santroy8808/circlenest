import { Prisma, ThetaCommSyncEventKind } from "@prisma/client";
import { prisma } from "@/lib/platform/db";
import { resolveChatAccessContext } from "@/modules/chat-messages/chat-access-policy";
import {
  replenishThetaCommPreKeysSchema,
  registerThetaCommDeviceSchema,
  revokeThetaCommDeviceSchema,
  thetaCommDeviceTrustSchema,
  THETA_COMM_MAX_DEVICES_PER_USER
} from "@/modules/theta-comm/types";
import {
  createSyncEvents,
  enqueuePushWakeups,
  identityKeyFingerprint,
  serializeDevice,
  ThetaCommError
} from "@/modules/theta-comm/theta-comm.shared";

export async function registerThetaCommDevice(userId: string, input: unknown) {
  const parsed = registerThetaCommDeviceSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThetaCommError(400, "INVALID_DEVICE", parsed.error.issues[0]?.message ?? "Invalid device registration.");
  }
  const data = parsed.data;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.userDevice.findUnique({
      where: { userId_deviceId: { userId, deviceId: data.deviceId } }
    });
    if (!existing) {
      const activeCount = await tx.userDevice.count({ where: { userId, revokedAt: null } });
      if (activeCount >= THETA_COMM_MAX_DEVICES_PER_USER) {
        throw new ThetaCommError(
          409,
          "DEVICE_LIMIT",
          `Theta-Comm supports at most ${THETA_COMM_MAX_DEVICES_PER_USER} active devices per member.`
        );
      }
    }

    const identityChanged = Boolean(existing?.commIdentityKey && existing.commIdentityKey !== data.identityKey);
    const device = await tx.userDevice.upsert({
      where: { userId_deviceId: { userId, deviceId: data.deviceId } },
      update: {
        publicKey: data.identityKey,
        commRegistrationId: data.registrationId,
        commIdentityKey: data.identityKey,
        commSignedPreKeyId: data.signedPreKey.keyId,
        commSignedPreKey: data.signedPreKey.publicKey,
        commSignedPreKeySignature: data.signedPreKey.signature,
        commKeyUpdatedAt: new Date(),
        commKeyVersion: identityChanged ? { increment: 1 } : undefined,
        platform: data.platform,
        appVersion: data.appVersion,
        lastSeenAt: new Date(),
        revokedAt: null
      },
      create: {
        userId,
        deviceId: data.deviceId,
        publicKey: data.identityKey,
        commRegistrationId: data.registrationId,
        commIdentityKey: data.identityKey,
        commSignedPreKeyId: data.signedPreKey.keyId,
        commSignedPreKey: data.signedPreKey.publicKey,
        commSignedPreKeySignature: data.signedPreKey.signature,
        commKeyUpdatedAt: new Date(),
        platform: data.platform,
        appVersion: data.appVersion
      }
    });

    await tx.thetaCommPreKey.deleteMany({
      where: { userDeviceId: device.id, consumedAt: null }
    });
    await tx.thetaCommPreKey.createMany({
      data: data.oneTimePreKeys.map((preKey) => ({
        userDeviceId: device.id,
        keyId: preKey.keyId,
        publicKey: preKey.publicKey
      })),
      skipDuplicates: true
    });
    await tx.thetaCommKyberPreKey.deleteMany({
      where: { userDeviceId: device.id, consumedAt: null }
    });
    await tx.thetaCommKyberPreKey.createMany({
      data: data.oneTimeKyberPreKeys.map((preKey) => ({
        userDeviceId: device.id,
        keyId: preKey.keyId,
        publicKey: preKey.publicKey,
        signature: preKey.signature
      })),
      skipDuplicates: true
    });

    if (identityChanged) {
      await tx.thetaCommDeviceTrust.updateMany({
        where: { trustedDeviceId: device.id, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    if (data.push) {
      await tx.thetaCommPushRegistration.updateMany({
        where: { userDeviceId: device.id, token: { not: data.push.token } },
        data: { enabled: false }
      });
      await tx.thetaCommPushRegistration.upsert({
        where: { token: data.push.token },
        update: {
          userDeviceId: device.id,
          provider: data.push.provider,
          appInstanceId: data.push.appInstanceId,
          enabled: true,
          lastSeenAt: new Date()
        },
        create: {
          userDeviceId: device.id,
          provider: data.push.provider,
          token: data.push.token,
          appInstanceId: data.push.appInstanceId
        }
      });
    }

    await createSyncEvents(tx, {
      userIds: [userId],
      kind: ThetaCommSyncEventKind.CONVERSATION,
      payload: {
        action: identityChanged ? "DEVICE_KEY_ROTATED" : "DEVICE_REGISTERED",
        deviceId: device.id
      }
    });
    await enqueuePushWakeups(tx, {
      userIds: [userId],
      excludeDeviceIds: [device.id],
      reason: "device"
    });

    return {
      device: serializeDevice(device),
      preKeyCount: data.oneTimePreKeys.length,
      kyberPreKeyCount: data.oneTimeKyberPreKeys.length,
      identityChanged
    };
  });
}

export async function replenishThetaCommPreKeys(userId: string, input: unknown) {
  const parsed = replenishThetaCommPreKeysSchema.safeParse(input);
  if (!parsed.success) {
    throw new ThetaCommError(400, "INVALID_PREKEYS", parsed.error.issues[0]?.message ?? "Invalid prekeys.");
  }
  const device = await prisma.userDevice.findFirst({
    where: {
      userId,
      deviceId: parsed.data.deviceId,
      revokedAt: null,
      commIdentityKey: { not: null }
    },
    select: { id: true }
  });
  if (!device) throw new ThetaCommError(404, "DEVICE_NOT_FOUND", "Theta-Comm device not found.");

  await prisma.thetaCommPreKey.createMany({
    data: parsed.data.oneTimePreKeys.map((preKey) => ({
      userDeviceId: device.id,
      keyId: preKey.keyId,
      publicKey: preKey.publicKey
    })),
    skipDuplicates: true
  });
  await prisma.thetaCommKyberPreKey.createMany({
    data: parsed.data.oneTimeKyberPreKeys.map((preKey) => ({
      userDeviceId: device.id,
      keyId: preKey.keyId,
      publicKey: preKey.publicKey,
      signature: preKey.signature
    })),
    skipDuplicates: true
  });
  const [available, kyberAvailable] = await Promise.all([
    prisma.thetaCommPreKey.count({
      where: { userDeviceId: device.id, consumedAt: null }
    }),
    prisma.thetaCommKyberPreKey.count({
      where: { userDeviceId: device.id, consumedAt: null }
    })
  ]);
  return { ok: true as const, available, kyberAvailable };
}

export async function listThetaCommDevices(userId: string) {
  const devices = await prisma.userDevice.findMany({
    where: { userId },
    orderBy: [{ revokedAt: "asc" }, { lastSeenAt: "desc" }],
    select: {
      id: true,
      deviceId: true,
      platform: true,
      appVersion: true,
      lastSeenAt: true,
      revokedAt: true,
      commIdentityKey: true,
      commKeyVersion: true
    }
  });
  return { devices: devices.map(serializeDevice) };
}

export async function revokeThetaCommDevice(userId: string, input: unknown) {
  const parsed = revokeThetaCommDeviceSchema.safeParse(input);
  if (!parsed.success) throw new ThetaCommError(400, "INVALID_DEVICE", "Choose a valid device.");

  return prisma.$transaction(async (tx) => {
    const device = await tx.userDevice.findFirst({
      where: { id: parsed.data.deviceId, userId, revokedAt: null },
      select: { id: true }
    });
    if (!device) throw new ThetaCommError(404, "DEVICE_NOT_FOUND", "Active Theta-Comm device not found.");

    const revokedAt = new Date();
    await tx.userDevice.update({ where: { id: device.id }, data: { revokedAt } });
    await tx.thetaCommPushRegistration.updateMany({
      where: { userDeviceId: device.id },
      data: { enabled: false }
    });
    await tx.thetaCommDeviceTrust.updateMany({
      where: {
        OR: [{ verifierDeviceId: device.id }, { trustedDeviceId: device.id }],
        revokedAt: null
      },
      data: { revokedAt }
    });
    await createSyncEvents(tx, {
      userIds: [userId],
      kind: ThetaCommSyncEventKind.DEVICE_REVOKED,
      payload: { deviceId: device.id }
    });
    await enqueuePushWakeups(tx, {
      userIds: [userId],
      excludeDeviceIds: [device.id],
      reason: "device"
    });
    return { ok: true as const, revokedAt: revokedAt.toISOString() };
  });
}

export async function trustThetaCommDevice(userId: string, input: unknown) {
  const parsed = thetaCommDeviceTrustSchema.safeParse(input);
  if (!parsed.success) throw new ThetaCommError(400, "INVALID_TRUST", "Invalid device verification.");
  const data = parsed.data;

  const [verifier, trusted] = await Promise.all([
    prisma.userDevice.findFirst({
      where: { id: data.verifierDeviceId, userId, revokedAt: null },
      select: { id: true }
    }),
    prisma.userDevice.findFirst({
      where: { id: data.trustedDeviceId, revokedAt: null, commIdentityKey: { not: null } },
      select: { id: true, userId: true, commIdentityKey: true }
    })
  ]);
  if (!verifier || !trusted?.commIdentityKey) {
    throw new ThetaCommError(404, "DEVICE_NOT_FOUND", "One of the devices is no longer active.");
  }
  if (identityKeyFingerprint(trusted.commIdentityKey) !== data.identityKeyHash.toLowerCase()) {
    throw new ThetaCommError(409, "KEY_CHANGED", "The device identity key changed before verification completed.");
  }

  const sharedConversation = await prisma.encryptedChatThread.findFirst({
    where: {
      participants: {
        every: { userId: { in: [userId, trusted.userId] } }
      },
      AND: [
        { participants: { some: { userId, leftAt: null, removedAt: null } } },
        { participants: { some: { userId: trusted.userId, leftAt: null, removedAt: null } } }
      ]
    },
    select: { id: true }
  });
  if (!sharedConversation && trusted.userId !== userId) {
    throw new ThetaCommError(403, "NOT_ALLOWED", "Device verification requires a shared Theta-Comm conversation.");
  }

  const trust = await prisma.thetaCommDeviceTrust.upsert({
    where: {
      verifierDeviceId_trustedDeviceId: {
        verifierDeviceId: verifier.id,
        trustedDeviceId: trusted.id
      }
    },
    update: {
      identityKeyHash: data.identityKeyHash.toLowerCase(),
      verifiedAt: new Date(),
      revokedAt: null
    },
    create: {
      verifierDeviceId: verifier.id,
      trustedDeviceId: trusted.id,
      identityKeyHash: data.identityKeyHash.toLowerCase()
    }
  });
  return { ok: true as const, verifiedAt: trust.verifiedAt.toISOString() };
}

export async function getThetaCommPreKeyBundles(
  requesterUserId: string,
  verifierDeviceId: string,
  requestedUserIds: readonly string[]
) {
  const userIds = [...new Set(requestedUserIds.filter(Boolean))].slice(0, 100);
  if (userIds.length === 0) return { bundles: [] };
  const context = await resolveChatAccessContext(requesterUserId);
  if (!context.userId) throw new ThetaCommError(401, "LOGIN_REQUIRED", "Login required.");

  const allowedUsers = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      AND: [
        {
          OR: [
            { id: requesterUserId },
            context.visibleUserWhere
          ]
        }
      ]
    },
    select: { id: true }
  });
  const allowedUserIds = new Set(allowedUsers.map((user) => user.id));
  if (allowedUserIds.size !== userIds.length) {
    throw new ThetaCommError(404, "MEMBER_NOT_FOUND", "One or more members are unavailable.");
  }

  return prisma.$transaction(
    async (tx) => {
      const devices = await tx.userDevice.findMany({
        where: {
          userId: { in: userIds },
          revokedAt: null,
          commIdentityKey: { not: null },
          commRegistrationId: { not: null },
          commSignedPreKey: { not: null },
          commSignedPreKeyId: { not: null },
          commSignedPreKeySignature: { not: null }
        },
        orderBy: [{ userId: "asc" }, { createdAt: "asc" }]
      });
      const trustRows = verifierDeviceId
        ? await tx.thetaCommDeviceTrust.findMany({
            where: {
              verifierDeviceId,
              trustedDeviceId: { in: devices.map((device) => device.id) },
              revokedAt: null
            },
            select: { trustedDeviceId: true, identityKeyHash: true }
          })
        : [];
      const trustedByDevice = new Map(trustRows.map((trust) => [trust.trustedDeviceId, trust.identityKeyHash]));

      const bundles = [];
      for (const device of devices) {
        const preKey = await tx.thetaCommPreKey.findFirst({
          where: { userDeviceId: device.id, consumedAt: null },
          orderBy: { createdAt: "asc" }
        });
        const kyberPreKey = await tx.thetaCommKyberPreKey.findFirst({
          where: { userDeviceId: device.id, consumedAt: null },
          orderBy: { createdAt: "asc" }
        });
        if (!kyberPreKey) {
          throw new ThetaCommError(
            409,
            "PREKEYS_DEPLETED",
            "A recipient device needs to replenish its post-quantum pre-keys."
          );
        }
        if (preKey) {
          await tx.thetaCommPreKey.update({
            where: { id: preKey.id },
            data: { consumedAt: new Date() }
          });
        }
        await tx.thetaCommKyberPreKey.update({
          where: { id: kyberPreKey.id },
          data: { consumedAt: new Date() }
        });
        bundles.push({
          userId: device.userId,
          deviceId: device.id,
          registrationId: device.commRegistrationId,
          identityKey: device.commIdentityKey,
          signedPreKey: {
            keyId: device.commSignedPreKeyId,
            publicKey: device.commSignedPreKey,
            signature: device.commSignedPreKeySignature
          },
          oneTimePreKey: preKey ? { keyId: preKey.keyId, publicKey: preKey.publicKey } : null,
          kyberPreKey: {
            keyId: kyberPreKey.keyId,
            publicKey: kyberPreKey.publicKey,
            signature: kyberPreKey.signature
          },
          keyVersion: device.commKeyVersion,
          verified: trustedByDevice.get(device.id) === identityKeyFingerprint(device.commIdentityKey ?? "")
        });
      }
      return { bundles };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
