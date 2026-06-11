import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ADMIN_MODE_COOKIE_NAME, createAdminModeCookie, hasAdminModeAccess } from "@/lib/security/admin-mode";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = cookies().get(ADMIN_MODE_COOKIE_NAME)?.value;
  if (!hasAdminModeAccess(session.user.id, token)) {
    return NextResponse.json({ error: "Administrator mode is off." }, { status: 423 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(createAdminModeCookie(session.user.id));
  return response;
}
