import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { ADMIN_MODE_COOKIE_NAME, hasAdminModeAccess } from "@/lib/security/admin-mode";

export function requireAdminModePage(userId: string) {
  const token = cookies().get(ADMIN_MODE_COOKIE_NAME)?.value;
  if (!hasAdminModeAccess(userId, token)) {
    redirect("/settings/account#administrator-mode");
  }
}

export function adminModeLockedResponse(userId: string) {
  const token = cookies().get(ADMIN_MODE_COOKIE_NAME)?.value;
  if (hasAdminModeAccess(userId, token)) return null;
  return NextResponse.json({ error: "Administrator mode is off." }, { status: 423 });
}
