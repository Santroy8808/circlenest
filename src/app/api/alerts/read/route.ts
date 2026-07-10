import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import { markAlertRead } from "@/modules/notifications-alerts/notifications-alerts.service";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const parsedBody = await readJsonRequest(request, 8 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  if (typeof parsedBody.value !== "object" || parsedBody.value === null || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const body = parsedBody.value as { id?: unknown };

  if (typeof body.id !== "string" || !body.id.trim()) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const result = await markAlertRead(session.user.id, body.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
