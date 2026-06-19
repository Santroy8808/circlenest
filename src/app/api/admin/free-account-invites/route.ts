import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import {
  applyFreeAccountInviteCodeToAccount,
  createFreeAccountInviteCode,
  emailFreeAccountInviteCode,
  listFreeAccountInviteAdminView
} from "@/modules/membership-policy/free-account-invites.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked || !(await isAdminUser(session.user.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  return NextResponse.json({ freeInvites: await listFreeAccountInviteAdminView() });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  let result:
    | Awaited<ReturnType<typeof createFreeAccountInviteCode>>
    | Awaited<ReturnType<typeof emailFreeAccountInviteCode>>
    | Awaited<ReturnType<typeof applyFreeAccountInviteCodeToAccount>>;

  if (body?.action === "email") {
    result = await emailFreeAccountInviteCode(session.user.id, body);
  } else if (body?.action === "apply") {
    result = await applyFreeAccountInviteCodeToAccount(session.user.id, body);
  } else {
    result = await createFreeAccountInviteCode(session.user.id, body);
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result, { status: 201 });
}
