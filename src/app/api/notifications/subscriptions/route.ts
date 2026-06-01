import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.pushSubscription.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      platform: true,
      endpoint: true,
      deviceId: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
      lastSentAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    platform?: string;
    endpoint?: string;
    deviceId?: string;
    p256dh?: string;
    auth?: string;
    enabled?: boolean;
  };

  const platform = String(body.platform ?? "").trim().toUpperCase();
  const endpoint = String(body.endpoint ?? "").trim();
  if (!platform || !endpoint) {
    return NextResponse.json({ error: "platform and endpoint are required" }, { status: 400 });
  }

  const row = await prisma.pushSubscription.upsert({
    where: { userId_endpoint: { userId: session.user.id, endpoint } },
    create: {
      userId: session.user.id,
      platform,
      endpoint,
      deviceId: body.deviceId?.trim() || null,
      p256dh: body.p256dh?.trim() || null,
      auth: body.auth?.trim() || null,
      enabled: body.enabled ?? true,
    },
    update: {
      platform,
      deviceId: body.deviceId?.trim() || null,
      p256dh: body.p256dh?.trim() || null,
      auth: body.auth?.trim() || null,
      enabled: body.enabled ?? true,
    },
  });

  return NextResponse.json(row);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = body.endpoint?.trim();
  if (!endpoint) return NextResponse.json({ error: "endpoint is required" }, { status: 400 });

  await prisma.pushSubscription.deleteMany({
    where: { userId: session.user.id, endpoint },
  });
  return NextResponse.json({ ok: true });
}
