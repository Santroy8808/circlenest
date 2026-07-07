import { auth } from "@/auth";
import { AuditorsDirectoryClient } from "@/components/auditors/auditors-directory-client";
import { AppShell } from "@/components/platform/app-shell";
import { safeListAuditors, viewerCanCreateAuditorProfile } from "@/modules/auditors/auditors.service";

export default async function AuditorsPage() {
  const session = await auth();
  const [auditors, access] = await Promise.all([
    safeListAuditors(),
    session?.user && !session.user.revoked ? viewerCanCreateAuditorProfile(session.user.id) : Promise.resolve({ allowed: false })
  ]);

  return (
    <AppShell>
      <AuditorsDirectoryClient initialAuditors={auditors} viewerCanCreate={access.allowed} />
    </AppShell>
  );
}
