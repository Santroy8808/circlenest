import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { hideNotifications } from "@/modules/notifications-alerts/notifications-alerts.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "Select at least one notification to hide." }, { status: 400 });
  }

  return NextResponse.json(await hideNotifications(session.user.id, ids));
}
