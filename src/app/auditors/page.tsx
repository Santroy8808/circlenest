import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuditorsDirectoryClient } from "@/components/auditors/auditors-directory-client";
import { AppShell } from "@/components/platform/app-shell";
import { safeListAuditors, viewerCanCreateAuditorProfile } from "@/modules/auditors/auditors.service";

export default async function AuditorsPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/auditors");
  }

  const [auditors, access] = await Promise.all([safeListAuditors(), viewerCanCreateAuditorProfile(session.user.id)]);

  return (
    <AppShell>
      <AuditorsDirectoryClient initialAuditors={auditors} viewerCanCreate={access.allowed} />
    </AppShell>
  );
}
