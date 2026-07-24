import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readJsonRequest } from "@/lib/platform/api-request";
import { isAdminUser } from "@/modules/admin-moderation/admin-moderation.service";
import {
  getDeleteProtectionAdminView,
  updateDeleteProtectionPassword
} from "@/modules/admin-moderation/delete-protection.service";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.revoked || !(await isAdminUser(session.user.id))) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  return NextResponse.json({ view: await getDeleteProtectionAdminView(session.user.id) });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.revoked) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const body = await readJsonRequest(request, 16 * 1024);
  if (!body.ok) return body.response;

  const result = await updateDeleteProtectionPassword(session.user.id, body.value);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, view: result.view });
}
