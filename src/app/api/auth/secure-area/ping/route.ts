import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { SECURE_AREA_COOKIE_NAME, createSecureAreaCookie, hasSecureAreaAccess } from "@/lib/security/secure-area";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = cookies().get(SECURE_AREA_COOKIE_NAME)?.value;
  if (!hasSecureAreaAccess(session.user.id, token)) {
    return NextResponse.json({ error: "Secure area locked." }, { status: 423 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(createSecureAreaCookie(session.user.id));
  return response;
}
