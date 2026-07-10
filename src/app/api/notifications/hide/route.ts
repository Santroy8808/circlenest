import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import { hideNotifications } from "@/modules/notifications-alerts/notifications-alerts.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const parsedBody = await readJsonRequest(request, 32 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "Select at least one notification to hide." }, { status: 400 });
  }

  const result = await hideNotifications(session.user.id, ids);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
