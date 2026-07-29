import { NextRequest, NextResponse } from "next/server";
import { readJsonRequest } from "@/lib/platform/api-request";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { thetaCommApiError } from "@/modules/theta-comm/api";
import {
  listThetaCommDevices,
  registerThetaCommDevice,
  revokeThetaCommDevice
} from "@/modules/theta-comm/device.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });
  try {
    return NextResponse.json(await listThetaCommDevices(session.user.id));
  } catch (error) {
    return thetaCommApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const body = await readJsonRequest(request, 1024 * 1024);
  if (!body.ok) return body.response;
  try {
    if (
      session.deviceId &&
      typeof body.value === "object" &&
      body.value !== null &&
      !Array.isArray(body.value) &&
      "deviceId" in body.value &&
      body.value.deviceId !== session.deviceId
    ) {
      return NextResponse.json(
        { error: "The login session is bound to another device.", code: "DEVICE_SESSION_MISMATCH" },
        { status: 403 }
      );
    }
    return NextResponse.json(await registerThetaCommDevice(session.user.id, body.value));
  } catch (error) {
    return thetaCommApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;
  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const body = await readJsonRequest(request, 8 * 1024);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(await revokeThetaCommDevice(session.user.id, body.value));
  } catch (error) {
    return thetaCommApiError(error);
  }
}
