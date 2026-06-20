import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/platform/mobile-auth";
import { getUnreadCounts } from "@/modules/notifications-alerts/notifications-alerts.service";

export async function GET(request: NextRequest) {
  const session = await requireMobileSession(request);

  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  return NextResponse.json({ counts: await getUnreadCounts(session.user.id) });
}
