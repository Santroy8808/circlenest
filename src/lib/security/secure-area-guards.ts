import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { SECURE_AREA_COOKIE_NAME, buildSecureAreaRedirect, hasSecureAreaAccess } from "@/lib/security/secure-area";

export function requireSecureAreaPage(userId: string, nextPath: string) {
  const token = cookies().get(SECURE_AREA_COOKIE_NAME)?.value;
  if (!hasSecureAreaAccess(userId, token)) {
    redirect(buildSecureAreaRedirect(nextPath, "locked"));
  }
}

export function secureAreaLockedResponse(userId: string) {
  const token = cookies().get(SECURE_AREA_COOKIE_NAME)?.value;
  if (hasSecureAreaAccess(userId, token)) return null;
  return NextResponse.json({ error: "Secure area locked." }, { status: 423 });
}
