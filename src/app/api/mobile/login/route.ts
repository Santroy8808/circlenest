import { NextRequest, NextResponse } from "next/server";
import { authorizeCredentials } from "@/modules/auth-security/auth-security.service";
import { createMobileToken } from "@/lib/platform/mobile-auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const user = await authorizeCredentials(body, {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? "ThetaSpaceAndroidNative"
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid email/username or password." }, { status: 401 });
  }

  return NextResponse.json({
    token: createMobileToken({ userId: user.id, sessionVersion: user.sessionVersion }),
    user
  });
}
