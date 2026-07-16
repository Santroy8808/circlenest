import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import {
  listRegisteredFeatureFlags,
  resetRegisteredFeatureFlag,
  setRegisteredFeatureFlagCategory,
  setRegisteredFeatureFlag
} from "@/modules/feature-flags/feature-flags.service";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.revoked || !(await isAdminUser(session.user.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  return NextResponse.json({ flags: await listRegisteredFeatureFlags() });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await readJsonRequest(request, 16 * 1024);
  if (!body.ok) return body.response;
  const value = body.value && typeof body.value === "object" && !Array.isArray(body.value)
    ? (body.value as Record<string, unknown>)
    : {};
  const result = value.action === "reset"
    ? await resetRegisteredFeatureFlag(session.user.id, value)
    : value.action === "set-category"
      ? await setRegisteredFeatureFlagCategory(session.user.id, value)
      : await setRegisteredFeatureFlag(session.user.id, value);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, flags: await listRegisteredFeatureFlags() });
}
