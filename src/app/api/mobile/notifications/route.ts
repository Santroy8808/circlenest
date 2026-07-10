import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import {
  hideNotifications,
  listAlertsPage,
  listNotificationsPage,
  markAlertRead,
  markAllNotificationsRead,
  markNotificationRead
} from "@/modules/notifications-alerts/notifications-alerts.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const type = request.nextUrl.searchParams.get("type") ?? "notifications";
  const cursor = request.nextUrl.searchParams.get("cursor");
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
  const pageInput = {
    ...(cursor ? { cursor } : {}),
    ...(Number.isFinite(limit) ? { limit } : {})
  };

  if (type === "alerts") {
    const page = await listAlertsPage(session.user.id, pageInput);
    return NextResponse.json({ alerts: page.items, items: page.items, nextCursor: page.nextCursor });
  }

  const page = await listNotificationsPage(session.user.id, pageInput);
  return NextResponse.json({ notifications: page.items, items: page.items, nextCursor: page.nextCursor });
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const parsedBody = await readJsonRequest(request, 32 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  if (typeof parsedBody.value !== "object" || parsedBody.value === null || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const body = parsedBody.value as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "read";
  const id = typeof body.id === "string" ? body.id.trim() : "";

  if (action === "hide") {
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((value): value is string => typeof value === "string")
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "Select at least one notification to hide." }, { status: 400 });
    }
    const result = await hideNotifications(session.user.id, ids);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (action !== "read") {
    return NextResponse.json({ error: "Unsupported notification action." }, { status: 400 });
  }

  if (body.type === "alerts") {
    if (!id) return NextResponse.json({ error: "Alert ID is required." }, { status: 400 });
    const result = await markAlertRead(session.user.id, id);
    return NextResponse.json(result, { status: result.ok ? 200 : 404 });
  }

  if (body.all === true) {
    return NextResponse.json(await markAllNotificationsRead(session.user.id));
  }
  if (!id) return NextResponse.json({ error: "Notification ID is required." }, { status: 400 });
  const result = await markNotificationRead(session.user.id, id);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
