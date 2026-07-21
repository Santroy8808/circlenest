import { auth } from "@/auth";
import { AuditorsDirectoryClient } from "@/components/auditors/auditors-directory-client";
import { AppShell } from "@/components/platform/app-shell";
import { safeListAuditors } from "@/modules/auditors/auditors.service";
import { resolveMembershipRouteAccess } from "@/modules/membership-policy/route-access";

export default async function AuditorsPage() {
  const session = await auth();
  const [auditors, access] = await Promise.all([
    safeListAuditors(),
    session?.user && !session.user.revoked
      ? resolveMembershipRouteAccess(session.user.id, "auditorProfileCreate", "page")
      : Promise.resolve({ allowed: false as const })
  ]);

  return (
    <AppShell>
      <AuditorsDirectoryClient initialAuditors={auditors} viewerCanCreate={access.allowed} />
    </AppShell>
  );
}
