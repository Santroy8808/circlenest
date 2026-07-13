import { NextRequest, NextResponse } from "next/server";
import {
  createMobileToken,
  mobileAuthUnavailableResponse,
  requireMobileSession
} from "@/lib/platform/mobile-auth";

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  return NextResponse.json(
    {
      token: createMobileToken({
        userId: session.user.id,
        sessionVersion: session.user.sessionVersion,
        deviceId: session.deviceId
      })
    },
    { headers: { "cache-control": "no-store" } }
  );
}
