import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import { changeInvitePermission, changeMembershipStatus, findStatusChangeAccount } from "@/modules/admin-moderation/status-change.service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user || session.user.revoked || !(await isAdminUser(session.user.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const identifier = request.nextUrl.searchParams.get("identifier");

  if (!identifier) {
    return NextResponse.json({ account: null });
  }

  return NextResponse.json({ account: await findStatusChangeAccount(identifier) });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const result = body?.action === "invite-permission"
    ? await changeInvitePermission(session.user.id, body)
    : await changeMembershipStatus(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ account: result.account });
}
