import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import { createLaunchAccessGrant, listLaunchAccessAdminView } from "@/modules/membership-policy/launch-access.service";

export async function GET() {
  const session = await auth();

  if (!session?.user || session.user.revoked || !(await isAdminUser(session.user.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  return NextResponse.json(await listLaunchAccessAdminView());
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const result = await createLaunchAccessGrant(session.user.id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ grant: result.grant }, { status: 201 });
}
