import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pref = await prisma.userFeedPreference.findUnique({
    where: { userId: session.user.id },
    select: {
      notificationDingsEnabled: true,
      alertDingsEnabled: true,
    },
  });

  return NextResponse.json({
    notificationDingsEnabled: pref?.notificationDingsEnabled ?? true,
    alertDingsEnabled: pref?.alertDingsEnabled ?? true,
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    notificationDingsEnabled?: boolean;
    alertDingsEnabled?: boolean;
  };

  const pref = await prisma.userFeedPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      notificationDingsEnabled: body.notificationDingsEnabled ?? true,
      alertDingsEnabled: body.alertDingsEnabled ?? true,
    },
    update: {
      notificationDingsEnabled: body.notificationDingsEnabled,
      alertDingsEnabled: body.alertDingsEnabled,
    },
    select: {
      notificationDingsEnabled: true,
      alertDingsEnabled: true,
    },
  });

  return NextResponse.json(pref);
}

