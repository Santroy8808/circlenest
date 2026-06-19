import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { recordPlatformActivity } from "@/modules/platform-activity/platform-activity.service";

function getIpAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => null);
  const result = await recordPlatformActivity({
    userId: session.user.id,
    body,
    ipAddress: getIpAddress(request),
    userAgent: request.headers.get("user-agent")
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
