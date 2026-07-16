import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuditorProfileForm } from "@/components/auditors/auditor-profile-form";
import { AppShell } from "@/components/platform/app-shell";
import { isAdminRole } from "@/lib/platform/roles";
import { getMyAuditorProfile } from "@/modules/auditors/auditors.service";
import { canUserAccessFeature } from "@/modules/membership-policy/membership-policy.service";

export default async function ImAnAuditorPage() {
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect("/login?callbackUrl=/auditors/im-an-auditor");
  }

  const access = await canUserAccessFeature(session.user.id, "auditors.createProfile");
  if (!isAdminRole(session.user.role) && !access.allowed) notFound();

  const result = await getMyAuditorProfile(session.user.id);

  return (
    <AppShell>
      <AuditorProfileForm data={result} />
    </AppShell>
  );
}
