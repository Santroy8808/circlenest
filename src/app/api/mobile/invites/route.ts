import { NextRequest, NextResponse } from "next/server";
import { mobileAuthUnavailableResponse, requireMobileSession } from "@/lib/platform/mobile-auth";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";
import {
  createMemberFreeAccountInviteCode,
  listOwnFreeAccountInvites
} from "@/modules/membership-policy/free-account-invites.service";

export async function GET(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const access = await canUserAccessFeature(session.user.id, "invites.send");
  return NextResponse.json({
    canInvite: access.allowed,
    reason: access.reason,
    invites: access.allowed ? await listOwnFreeAccountInvites(session.user.id) : []
  });
}

export async function POST(request: NextRequest) {
  const unavailable = mobileAuthUnavailableResponse();
  if (unavailable) return unavailable;

  const session = await requireMobileSession(request);
  if (!session) return NextResponse.json({ error: "Login required." }, { status: 401 });

  const result = await createMemberFreeAccountInviteCode(session.user.id, await request.json().catch(() => ({})));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
