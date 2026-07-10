import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listAlertsPage } from "@/modules/notifications-alerts/notifications-alerts.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const cursor = request.nextUrl.searchParams.get("cursor");
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  const page = await listAlertsPage(session.user.id, {
    ...(cursor ? { cursor } : {}),
    ...(Number.isFinite(limit) ? { limit } : {})
  });

  return NextResponse.json({ alerts: page.items, items: page.items, nextCursor: page.nextCursor });
}
