import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { thetaCommApiError } from "@/modules/theta-comm/api";
import {
  getThetaCommPreKeyBundles,
  listThetaCommRecipientDevices,
  replenishThetaCommPreKeys
} from "@/modules/theta-comm/device.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const userIds = (request.nextUrl.searchParams.get("userIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const verifierDeviceId = (request.nextUrl.searchParams.get("deviceId") ?? "").trim();
  const requestedDeviceIds = (request.nextUrl.searchParams.get("deviceIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  try {
    if (request.nextUrl.searchParams.get("mode") === "devices") {
      return NextResponse.json(
        await listThetaCommRecipientDevices(session.user.id, userIds)
      );
    }
    return NextResponse.json(
      await getThetaCommPreKeyBundles(
        session.user.id,
        verifierDeviceId,
        userIds,
        requestedDeviceIds
      )
    );
  } catch (error) {
    return thetaCommApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const body = await readJsonRequest(request, 512 * 1024);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await replenishThetaCommPreKeys(session.user.id, body.value));
  } catch (error) {
    return thetaCommApiError(error);
  }
}
