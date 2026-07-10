import { createPublicKey } from "crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { prisma } from "@/lib/platform/db";

const MAX_ACTIVE_DEVICES_PER_USER = 8;

function isSupportedPublicKey(value: string) {
  if (value.length < 120 || value.length > 8_192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;

  try {
    const key = createPublicKey({ key: Buffer.from(value, "base64"), format: "der", type: "spki" });
    return key.asymmetricKeyType === "rsa" && (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2_048;
  } catch {
    return false;
  }
}

function isSerializableConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}

async function registerDeviceWithCap(input: {
  userId: string;
  deviceId: string;
  publicKey: string;
  platform: string;
  appVersion: string;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const [existing, activeCount] = await Promise.all([
            transaction.userDevice.findUnique({
              where: { userId_deviceId: { userId: input.userId, deviceId: input.deviceId } },
              select: { revokedAt: true }
            }),
            transaction.userDevice.count({ where: { userId: input.userId, revokedAt: null } })
          ]);

          if ((!existing || existing.revokedAt) && activeCount >= MAX_ACTIVE_DEVICES_PER_USER) {
            const overflow = await transaction.userDevice.findMany({
              where: { userId: input.userId, revokedAt: null },
              orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
              skip: MAX_ACTIVE_DEVICES_PER_USER,
              select: { id: true }
            });
            if (overflow.length > 0) {
              await transaction.userDevice.updateMany({
                where: { id: { in: overflow.map((device) => device.id) } },
                data: { revokedAt: new Date() }
              });
            }
            return { ok: false as const, reason: "DEVICE_LIMIT" as const };
          }

          const device = await transaction.userDevice.upsert({
            where: {
              userId_deviceId: {
                userId: input.userId,
                deviceId: input.deviceId
              }
            },
            update: {
              publicKey: input.publicKey,
              platform: input.platform,
              appVersion: input.appVersion || null,
              revokedAt: null,
              lastSeenAt: new Date()
            },
            create: {
              userId: input.userId,
              deviceId: input.deviceId,
              publicKey: input.publicKey,
              platform: input.platform,
              appVersion: input.appVersion || null
            },
            select: {
              id: true,
              deviceId: true,
              publicKey: true,
              lastSeenAt: true
            }
          });

          const overflow = await transaction.userDevice.findMany({
            where: { userId: input.userId, revokedAt: null },
            orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
            skip: MAX_ACTIVE_DEVICES_PER_USER,
            select: { id: true }
          });
          if (overflow.length > 0) {
            await transaction.userDevice.updateMany({
              where: { id: { in: overflow.map((item) => item.id) } },
              data: { revokedAt: new Date() }
            });
          }

          return { ok: true as const, device };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (attempt < 2 && isSerializableConflict(error)) continue;
      throw error;
    }
  }

  throw new Error("Device registration transaction did not finish.");
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const parsedBody = await readJsonRequest(request, 12 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  if (typeof parsedBody.value !== "object" || parsedBody.value === null || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const body = parsedBody.value as Record<string, unknown>;
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim().slice(0, 160) : "";
  const publicKey = typeof body.publicKey === "string" ? body.publicKey.trim().slice(0, 8_193) : "";
  const platform = typeof body.platform === "string" ? body.platform.trim().slice(0, 40) : "android";
  const appVersion = typeof body.appVersion === "string" ? body.appVersion.trim().slice(0, 40) : "";

  if (!deviceId || !isSupportedPublicKey(publicKey)) {
    return NextResponse.json({ error: "A device ID and valid RSA public key are required." }, { status: 400 });
  }

  let registration;

  try {
    registration = await registerDeviceWithCap({
      userId: session.user.id,
      deviceId,
      publicKey,
      platform,
      appVersion
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UserDevice") || message.includes("user_devices") || message.includes("does not exist")) {
      return NextResponse.json(
        { error: "Mobile communications database tables are not deployed yet. Run the production Prisma schema sync." },
        { status: 503 }
      );
    }

    console.error("mobile device registration failed", error);
    return NextResponse.json({ error: "Device registration failed." }, { status: 500 });
  }

  if (!registration.ok) {
    return NextResponse.json(
      { error: `A member may have at most ${MAX_ACTIVE_DEVICES_PER_USER} active devices.` },
      { status: 409 }
    );
  }

  return NextResponse.json({ device: registration.device });
}
