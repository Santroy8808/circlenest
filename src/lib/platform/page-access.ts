import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/platform/roles";

function loginPath(returnTo: string) {
  const safePath = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/home";
  return `/login?returnTo=${encodeURIComponent(safePath)}`;
}

export async function requireMemberPage(returnTo: string) {
  const session = await auth();
  if (!session?.user || session.user.revoked) redirect(loginPath(returnTo));
  return session;
}

export async function requireAdminPage(returnTo: string) {
  const session = await requireMemberPage(returnTo);
  if (!isAdminRole(session.user.role)) redirect("/home");
  return session;
}
