import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { listAlerts, listNotifications } from "@/modules/notifications-alerts/notifications-alerts.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const type = request.nextUrl.searchParams.get("type") ?? "notifications";
  if (type === "alerts") return NextResponse.json({ alerts: await listAlerts(session.user.id) });
  return NextResponse.json({ notifications: await listNotifications(session.user.id) });
}
