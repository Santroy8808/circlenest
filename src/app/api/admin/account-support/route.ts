import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { adminCreateUserAccount, adminResetAccountPassword } from "@/modules/admin-moderation/account-support.service";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const result =
    body?.action === "create-user"
      ? await adminCreateUserAccount(session.user.id, body)
      : body?.action === "reset-password"
        ? await adminResetAccountPassword(session.user.id, body)
        : { ok: false as const, error: "Unknown account support action." };

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
