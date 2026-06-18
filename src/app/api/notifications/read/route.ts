import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { markNotificationRead } from "@/modules/notifications-alerts/notifications-alerts.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json()) as { id?: string };

  if (!body.id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  return NextResponse.json(await markNotificationRead(session.user.id, body.id));
}
