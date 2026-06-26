import { UserRole } from "@prisma/client";

export function isAdminRole(role?: UserRole | null) {
  return role === UserRole.ADMIN || role === UserRole.GOD;
}

export function isGodRole(role?: UserRole | null) {
  return role === UserRole.GOD;
}
