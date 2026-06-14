import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureBootstrapAdmins, isAdminUser } from "@/lib/auth/admin";
import { adminModeLockedResponse } from "@/lib/security/admin-mode-guards";
import { secureAreaLockedResponse } from "@/lib/security/secure-area-guards";

export async function requireAdminApiAccess() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  await ensureBootstrapAdmins();
  if (!(await isAdminUser(session.user.id))) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const adminModeLocked = adminModeLockedResponse(session.user.id);
  if (adminModeLocked) return { error: adminModeLocked };
  const locked = secureAreaLockedResponse(session.user.id);
  if (locked) return { error: locked };
  return { userId: session.user.id };
}
