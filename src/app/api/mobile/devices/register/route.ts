import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { prisma } from "@/lib/platform/db";

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim().slice(0, 160) : "";
  const publicKey = typeof body.publicKey === "string" ? body.publicKey.trim() : "";
  const platform = typeof body.platform === "string" ? body.platform.trim().slice(0, 40) : "android";
  const appVersion = typeof body.appVersion === "string" ? body.appVersion.trim().slice(0, 40) : "";

  if (!deviceId || !publicKey || publicKey.length < 120) {
    return NextResponse.json({ error: "Device ID and public key are required." }, { status: 400 });
  }

  let device;

  try {
    device = await prisma.userDevice.upsert({
      where: {
        userId_deviceId: {
          userId: session.user.id,
          deviceId
        }
      },
      update: {
        publicKey,
        platform,
        appVersion: appVersion || null,
        revokedAt: null,
        lastSeenAt: new Date()
      },
      create: {
        userId: session.user.id,
        deviceId,
        publicKey,
        platform,
        appVersion: appVersion || null
      },
      select: {
        id: true,
        deviceId: true,
        publicKey: true,
        lastSeenAt: true
      }
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

  return NextResponse.json({ device });
}
