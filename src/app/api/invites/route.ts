import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createMemberFreeAccountInviteCode,
  listOwnFreeAccountInvites,
  revokeOwnFreeAccountInviteCode
} from "@/modules/membership-policy/free-account-invites.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  return NextResponse.json({ invites: await listOwnFreeAccountInvites(session.user.id) });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await createMemberFreeAccountInviteCode(session.user.id, await request.json().catch(() => ({})));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    inviteCode: result.inviteCode,
    invite: result.invite,
    invites: await listOwnFreeAccountInvites(session.user.id)
  });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const result = await revokeOwnFreeAccountInviteCode(session.user.id, await request.json().catch(() => ({})));

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ invites: await listOwnFreeAccountInvites(session.user.id) });
}
