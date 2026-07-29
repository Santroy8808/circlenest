import { NextRequest, NextResponse } from "next/server";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { thetaCommApiError } from "@/modules/theta-comm/api";
import { syncThetaComm } from "@/modules/theta-comm/message.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const deviceId = (request.nextUrl.searchParams.get("deviceId") ?? "").trim();
  try {
    return NextResponse.json(
      await syncThetaComm(session.user.id, deviceId, {
        cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
        limit: request.nextUrl.searchParams.get("limit") ?? undefined
      }),
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return thetaCommApiError(error);
  }
}
