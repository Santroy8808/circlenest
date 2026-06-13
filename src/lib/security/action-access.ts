import { cookies } from "next/headers";
import { ADMIN_MODE_COOKIE_NAME, hasAdminModeAccess } from "@/lib/security/admin-mode";
import { SECURE_AREA_COOKIE_NAME, hasSecureAreaAccess } from "@/lib/security/secure-area";

export function hasFreshAdminModeAccess(userId: string) {
  return hasAdminModeAccess(userId, cookies().get(ADMIN_MODE_COOKIE_NAME)?.value);
}

export function hasFreshSecureAreaAccess(userId: string) {
  return hasSecureAreaAccess(userId, cookies().get(SECURE_AREA_COOKIE_NAME)?.value);
}

export function hasFreshPrivilegedActionAccess(userId: string) {
  return hasFreshAdminModeAccess(userId) && hasFreshSecureAreaAccess(userId);
}
